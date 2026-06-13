const express = require('express');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

/**
 * GET /api/expenses?group_id=X
 * List expenses for a group
 */
router.get('/', async (req, res) => {
  try {
    const { group_id, page = 1, limit = 50 } = req.query;
    if (!group_id) {
      return res.status(400).json({ error: 'group_id is required.' });
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM expenses WHERE group_id = $1',
      [group_id]
    );

    const result = await pool.query(
      `SELECT e.*, u.display_name as payer_name,
              json_agg(json_build_object(
                'user_id', es.user_id,
                'display_name', su.display_name,
                'share_amount', es.share_amount
              )) as splits
       FROM expenses e
       LEFT JOIN users u ON e.paid_by = u.id
       LEFT JOIN expense_splits es ON e.id = es.expense_id
       LEFT JOIN users su ON es.user_id = su.id
       WHERE e.group_id = $1
       GROUP BY e.id, u.display_name
       ORDER BY e.date DESC, e.created_at DESC
       LIMIT $2 OFFSET $3`,
      [group_id, parseInt(limit), offset]
    );

    res.json({
      expenses: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit)),
    });
  } catch (err) {
    console.error('List expenses error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/expenses
 * Create a new expense with splits
 */
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { group_id, description, amount, currency, date, split_type, notes, splits } = req.body;

    if (!group_id || !description || amount === undefined || !date || !split_type) {
      return res.status(400).json({ error: 'group_id, description, amount, date, and split_type are required.' });
    }

    // Insert expense
    const expResult = await client.query(
      `INSERT INTO expenses (group_id, description, amount, currency, paid_by, date, split_type, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [group_id, description, amount, currency || 'INR', req.user.id, date, split_type, notes || null]
    );
    const expense = expResult.rows[0];

    // Insert splits
    if (splits && splits.length > 0) {
      for (const split of splits) {
        await client.query(
          `INSERT INTO expense_splits (expense_id, user_id, share_amount)
           VALUES ($1, $2, $3)`,
          [expense.id, split.user_id, split.share_amount]
        );
      }
    }

    await client.query('COMMIT');

    res.status(201).json(expense);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create expense error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/expenses/:id
 * Get expense details with splits
 */
router.get('/:id', async (req, res) => {
  try {
    const expResult = await pool.query(
      `SELECT e.*, u.display_name as payer_name
       FROM expenses e
       LEFT JOIN users u ON e.paid_by = u.id
       WHERE e.id = $1`,
      [req.params.id]
    );

    if (expResult.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found.' });
    }

    const splitsResult = await pool.query(
      `SELECT es.*, u.display_name
       FROM expense_splits es
       JOIN users u ON es.user_id = u.id
       WHERE es.expense_id = $1`,
      [req.params.id]
    );

    res.json({
      ...expResult.rows[0],
      splits: splitsResult.rows,
    });
  } catch (err) {
    console.error('Get expense error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * PUT /api/expenses/:id
 * Update an expense
 */
router.put('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { description, amount, currency, date, split_type, notes, splits } = req.body;

    const result = await client.query(
      `UPDATE expenses SET
        description = COALESCE($1, description),
        amount = COALESCE($2, amount),
        currency = COALESCE($3, currency),
        date = COALESCE($4, date),
        split_type = COALESCE($5, split_type),
        notes = COALESCE($6, notes)
       WHERE id = $7 RETURNING *`,
      [description, amount, currency, date, split_type, notes, req.params.id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Expense not found.' });
    }

    // Update splits if provided
    if (splits && splits.length > 0) {
      await client.query('DELETE FROM expense_splits WHERE expense_id = $1', [req.params.id]);
      for (const split of splits) {
        await client.query(
          `INSERT INTO expense_splits (expense_id, user_id, share_amount) VALUES ($1, $2, $3)`,
          [req.params.id, split.user_id, split.share_amount]
        );
      }
    }

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update expense error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/expenses/:id
 * Delete an expense
 */
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM expenses WHERE id = $1', [req.params.id]);
    res.json({ message: 'Expense deleted.' });
  } catch (err) {
    console.error('Delete expense error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
