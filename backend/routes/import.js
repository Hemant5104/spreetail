const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');
const CSVImporter = require('../services/csvImporter');

const router = express.Router();
router.use(authMiddleware);

// Configure multer for CSV upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `import_${Date.now()}_${file.originalname}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed.'));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

/**
 * POST /api/import/analyze
 * Upload and analyze a CSV file, returning anomalies for review.
 * Does NOT commit data to the database.
 */
router.post('/analyze', upload.single('csv'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'CSV file is required.' });
    }

    const groupId = req.body.group_id;
    if (!groupId) {
      return res.status(400).json({ error: 'group_id is required.' });
    }

    const csvContent = fs.readFileSync(req.file.path, 'utf8');
    const result = await CSVImporter.analyzeCSV(csvContent, groupId, req.user.id);

    // Store the CSV content path for later commit
    // In a real app, we'd cache this or store in DB
    result.csvFilePath = req.file.path;

    res.json(result);
  } catch (err) {
    console.error('Import analyze error:', err);
    res.status(500).json({ error: `Import analysis failed: ${err.message}` });
  }
});

/**
 * POST /api/import/commit
 * Commit the import after user has reviewed all anomalies.
 */
router.post('/commit', async (req, res) => {
  try {
    const { import_id, group_id, resolutions, edited_rows, csv_path } = req.body;

    if (!import_id || !group_id) {
      return res.status(400).json({ error: 'import_id and group_id are required.' });
    }

    // Resolve any pending anomalies with user's resolutions
    if (resolutions) {
      for (const [anomalyId, resolution] of Object.entries(resolutions)) {
        await pool.query(
          `UPDATE import_anomalies SET resolution = $1, resolved_by = $2, resolved_at = NOW()
           WHERE id = $3 AND import_id = $4`,
          [resolution.action || 'accepted', req.user.id, anomalyId, import_id]
        );
      }
    }

    // Auto-accept any remaining pending anomalies
    await pool.query(
      `UPDATE import_anomalies SET resolution = 'accepted', resolved_by = $1, resolved_at = NOW()
       WHERE import_id = $2 AND resolution = 'pending'`,
      [req.user.id, import_id]
    );

    // Re-parse CSV and import
    let csvContent;
    if (csv_path && fs.existsSync(csv_path)) {
      csvContent = fs.readFileSync(csv_path, 'utf8');
    } else {
      return res.status(400).json({ error: 'CSV file not found. Please re-upload.' });
    }

    const rawRows = CSVImporter.parseCSV(csvContent);

    // Apply manual edits from the frontend
    if (edited_rows) {
      for (const [rowNumStr, edits] of Object.entries(edited_rows)) {
        // rowNum is 1-indexed including header, so array index is rowNum - 2
        const idx = parseInt(rowNumStr, 10) - 2;
        if (rawRows[idx]) {
          Object.assign(rawRows[idx], edits);
        }
      }
    }

    const processedRows = rawRows.map((row, i) => CSVImporter.preprocessRow(row, i));

    // Get anomalies from DB for resolution info
    const anomalyResult = await pool.query(
      `SELECT * FROM import_anomalies WHERE import_id = $1`,
      [import_id]
    );

    const importResult = await CSVImporter.importRows(
      processedRows,
      parseInt(group_id),
      anomalyResult.rows,
      resolutions || {}
    );

    // Save to import_history
    await pool.query(
      `INSERT INTO import_history 
       (import_id, group_id, imported_by, total_rows, imported_rows, skipped_rows, settlements_created, edited_rows)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        import_id,
        group_id,
        req.user.id,
        rawRows.length,
        importResult.imported,
        importResult.skipped,
        importResult.settlements,
        edited_rows ? JSON.stringify(edited_rows) : null,
      ]
    );

    res.json({
      success: true,
      importId: import_id,
      ...importResult,
    });
  } catch (err) {
    console.error('Import commit error:', err);
    res.status(500).json({ error: `Import commit failed: ${err.message}` });
  }
});

/**
 * GET /api/import/:importId/anomalies
 * Get anomalies for a specific import
 */
router.get('/:importId/anomalies', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM import_anomalies WHERE import_id = $1 ORDER BY csv_row`,
      [req.params.importId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get anomalies error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * PUT /api/import/anomalies/:id/resolve
 * Resolve a single anomaly
 */
router.put('/anomalies/:id/resolve', async (req, res) => {
  try {
    const { resolution, custom_fix } = req.body;
    await pool.query(
      `UPDATE import_anomalies
       SET resolution = $1, suggested_fix = COALESCE($2, suggested_fix),
           resolved_by = $3, resolved_at = NOW()
       WHERE id = $4`,
      [resolution || 'accepted', custom_fix ? JSON.stringify(custom_fix) : null, req.user.id, req.params.id]
    );
    res.json({ message: 'Anomaly resolved.' });
  } catch (err) {
    console.error('Resolve anomaly error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * GET /api/import/history?group_id=X
 * Fetch the import history for a specific group
 */
router.get('/history', async (req, res) => {
  try {
    const { group_id } = req.query;
    if (!group_id) {
      return res.status(400).json({ error: 'group_id is required.' });
    }

    const result = await pool.query(
      `SELECT h.*, u.display_name as importer_name
       FROM import_history h
       JOIN users u ON h.imported_by = u.id
       WHERE h.group_id = $1
       ORDER BY h.created_at DESC`,
      [group_id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Fetch import history error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
