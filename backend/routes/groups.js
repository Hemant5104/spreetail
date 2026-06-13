const express = require('express');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * GET /api/groups
 * List all groups the current user is a member of
 */
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT g.*, 
              COUNT(DISTINCT gm.user_id) as member_count,
              creator.display_name as created_by_name
       FROM groups g
       LEFT JOIN group_members gm ON g.id = gm.group_id AND gm.left_at IS NULL
       LEFT JOIN users creator ON g.created_by = creator.id
       WHERE g.id IN (SELECT group_id FROM group_members WHERE user_id = $1)
       GROUP BY g.id, creator.display_name
       ORDER BY g.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('List groups error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/groups
 * Create a new group
 */
router.post('/', async (req, res) => {
  try {
    const { name, description, join_as_member = true } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Group name is required.' });
    }

    const result = await pool.query(
      `INSERT INTO groups (name, description, created_by)
       VALUES ($1, $2, $3) RETURNING *`,
      [name, description || null, req.user.id]
    );

    const group = result.rows[0];

    // Auto-add creator as admin member if requested
    if (join_as_member) {
      await pool.query(
        `INSERT INTO group_members (group_id, user_id, joined_at, role)
         VALUES ($1, $2, CURRENT_DATE, 'admin')`,
        [group.id, req.user.id]
      );
    }

    res.status(201).json(group);
  } catch (err) {
    console.error('Create group error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * GET /api/groups/:id
 * Get group details including members
 */
router.get('/:id', async (req, res) => {
  try {
    const groupResult = await pool.query('SELECT * FROM groups WHERE id = $1', [req.params.id]);
    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found.' });
    }

    const membersResult = await pool.query(
      `SELECT gm.*, u.display_name, u.username
       FROM group_members gm
       JOIN users u ON gm.user_id = u.id
       WHERE gm.group_id = $1
       ORDER BY gm.joined_at`,
      [req.params.id]
    );

    res.json({
      ...groupResult.rows[0],
      members: membersResult.rows,
    });
  } catch (err) {
    console.error('Get group error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/groups/:id/members
 * Add a member to a group
 */
router.post('/:id/members', async (req, res) => {
  try {
    const { user_id, joined_at } = req.body;
    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required.' });
    }

    await pool.query(
      `INSERT INTO group_members (group_id, user_id, joined_at, role)
       VALUES ($1, $2, $3, 'member')
       ON CONFLICT (group_id, user_id, joined_at) DO NOTHING`,
      [req.params.id, user_id, joined_at || new Date().toISOString().split('T')[0]]
    );

    res.status(201).json({ message: 'Member added.' });
  } catch (err) {
    console.error('Add member error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * PUT /api/groups/:id/members/:userId/leave
 * Mark a member as having left the group
 */
router.put('/:id/members/:userId/leave', async (req, res) => {
  try {
    const { left_at } = req.body;
    await pool.query(
      `UPDATE group_members SET left_at = $1
       WHERE group_id = $2 AND user_id = $3 AND left_at IS NULL`,
      [left_at || new Date().toISOString().split('T')[0], req.params.id, req.params.userId]
    );
    res.json({ message: 'Member removed.' });
  } catch (err) {
    console.error('Leave group error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * PUT /api/groups/:id
 * Update group details
 */
router.put('/:id', async (req, res) => {
  try {
    const { name, description } = req.body;
    const result = await pool.query(
      `UPDATE groups SET name = COALESCE($1, name), description = COALESCE($2, description)
       WHERE id = $3 RETURNING *`,
      [name, description, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update group error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * DELETE /api/groups/:id
 * Delete a group
 */
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM groups WHERE id = $1', [req.params.id]);
    res.json({ message: 'Group deleted.' });
  } catch (err) {
    console.error('Delete group error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
