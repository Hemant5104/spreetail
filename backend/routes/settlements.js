const express = require('express');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

/**
 * GET /api/settlements?group_id=X
 * List settlements for a group
 */
router.get('/', async (req, res) => {
  try {
    const { group_id } = req.query;
    if (!group_id) {
      return res.status(400).json({ error: 'group_id is required.' });
    }

    const result = await pool.query(
      `SELECT s.*,
              payer.display_name as payer_name,
              payee.display_name as payee_name
       FROM settlements s
       JOIN users payer ON s.paid_by = payer.id
       JOIN users payee ON s.paid_to = payee.id
       WHERE s.group_id = $1
       ORDER BY s.date DESC`,
      [group_id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('List settlements error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/settlements
 * Record a new settlement (debt payment)
 */
router.post('/', async (req, res) => {
  try {
    const { group_id, paid_to, amount, currency, date, notes } = req.body;

    if (!group_id || !paid_to || !amount) {
      return res.status(400).json({ error: 'group_id, paid_to, and amount are required.' });
    }

    const result = await pool.query(
      `INSERT INTO settlements (group_id, paid_by, paid_to, amount, currency, date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        group_id,
        req.user.id,
        paid_to,
        amount,
        currency || 'INR',
        date || new Date().toISOString().split('T')[0],
        notes || null,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create settlement error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * DELETE /api/settlements/:id
 * Delete a settlement
 */
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM settlements WHERE id = $1', [req.params.id]);
    res.json({ message: 'Settlement deleted.' });
  } catch (err) {
    console.error('Delete settlement error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
