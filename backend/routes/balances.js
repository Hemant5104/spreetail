const express = require('express');
const authMiddleware = require('../middleware/auth');
const BalanceCalculator = require('../services/balanceCalculator');

const router = express.Router();
router.use(authMiddleware);

/**
 * GET /api/balances/:groupId
 * Get group balances with settlement suggestions
 */
router.get('/:groupId', async (req, res) => {
  try {
    const result = await BalanceCalculator.getGroupBalances(req.params.groupId);
    res.json(result);
  } catch (err) {
    console.error('Get balances error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * GET /api/balances/:groupId/user/:userId
 * Get detailed balance breakdown for a specific user (Rohan's drill-down)
 */
router.get('/:groupId/user/:userId', async (req, res) => {
  try {
    const result = await BalanceCalculator.getUserBalance(req.params.groupId, req.params.userId);
    res.json(result);
  } catch (err) {
    console.error('Get user balance error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
