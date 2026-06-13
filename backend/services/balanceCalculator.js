const pool = require('../db/pool');
const CurrencyService = require('./currencyService');

/**
 * Balance Calculator
 * Computes who owes whom, with multi-currency support and membership awareness.
 */
class BalanceCalculator {

  /**
   * Get the complete balance summary for a group.
   * Returns per-user balances (positive = owed money, negative = owes money)
   * along with a minimized set of settlement suggestions.
   */
  static async getGroupBalances(groupId) {
    // Get all expenses for this group
    const expensesResult = await pool.query(
      `SELECT e.*, u.display_name as payer_name
       FROM expenses e
       LEFT JOIN users u ON e.paid_by = u.id
       WHERE e.group_id = $1 AND e.is_settlement = false
       ORDER BY e.date`,
      [groupId]
    );

    // Get all expense splits
    const splitsResult = await pool.query(
      `SELECT es.*, e.currency, e.date, u.display_name as user_name
       FROM expense_splits es
       JOIN expenses e ON es.expense_id = e.id
       JOIN users u ON es.user_id = u.id
       WHERE e.group_id = $1 AND e.is_settlement = false`,
      [groupId]
    );

    // Get all settlements
    const settlementsResult = await pool.query(
      `SELECT s.*, 
              payer.display_name as payer_name,
              payee.display_name as payee_name
       FROM settlements s
       JOIN users payer ON s.paid_by = payer.id
       JOIN users payee ON s.paid_to = payee.id
       WHERE s.group_id = $1`,
      [groupId]
    );

    // Get group members
    const membersResult = await pool.query(
      `SELECT gm.*, u.display_name, u.username
       FROM group_members gm
       JOIN users u ON gm.user_id = u.id
       WHERE gm.group_id = $1`,
      [groupId]
    );

    // Calculate net balances (all in INR)
    const balances = {}; // userId → net balance in INR

    // Initialize all members
    for (const member of membersResult.rows) {
      balances[member.user_id] = {
        userId: member.user_id,
        displayName: member.display_name,
        username: member.username,
        totalPaid: 0,      // Total paid for the group
        totalOwed: 0,      // Total share of expenses
        netBalance: 0,     // totalPaid - totalOwed (positive = others owe you)
        joinedAt: member.joined_at,
        leftAt: member.left_at,
        expenses: [],      // Drill-down data
      };
    }

    // Process expenses: what each person PAID
    for (const expense of expensesResult.rows) {
      if (!expense.paid_by || !balances[expense.paid_by]) continue;

      let amountINR = parseFloat(expense.amount);
      if (expense.currency !== 'INR') {
        amountINR = await CurrencyService.convert(
          parseFloat(expense.amount),
          expense.currency,
          'INR',
          expense.date
        );
      }

      balances[expense.paid_by].totalPaid += amountINR;
      balances[expense.paid_by].expenses.push({
        id: expense.id,
        description: expense.description,
        amount: parseFloat(expense.amount),
        amountINR,
        currency: expense.currency,
        date: expense.date,
        type: 'paid',
      });
    }

    // Process splits: what each person OWES
    for (const split of splitsResult.rows) {
      if (!balances[split.user_id]) continue;

      let shareINR = parseFloat(split.share_amount);
      if (split.currency !== 'INR') {
        shareINR = await CurrencyService.convert(
          parseFloat(split.share_amount),
          split.currency,
          'INR',
          split.date
        );
      }

      balances[split.user_id].totalOwed += shareINR;
      balances[split.user_id].expenses.push({
        expenseId: split.expense_id,
        shareAmount: parseFloat(split.share_amount),
        shareAmountINR: shareINR,
        currency: split.currency,
        date: split.date,
        type: 'owed',
      });
    }

    // Process settlements
    for (const settlement of settlementsResult.rows) {
      let amountINR = parseFloat(settlement.amount);
      if (settlement.currency !== 'INR') {
        amountINR = await CurrencyService.convert(
          parseFloat(settlement.amount),
          settlement.currency,
          'INR',
          settlement.date
        );
      }

      if (balances[settlement.paid_by]) {
        balances[settlement.paid_by].totalPaid += amountINR;
      }
      if (balances[settlement.paid_to]) {
        balances[settlement.paid_to].totalOwed -= amountINR; // Reduces what they're owed
      }
    }

    // Calculate net balances
    for (const userId of Object.keys(balances)) {
      const b = balances[userId];
      b.totalPaid = Math.round(b.totalPaid * 100) / 100;
      b.totalOwed = Math.round(b.totalOwed * 100) / 100;
      b.netBalance = Math.round((b.totalPaid - b.totalOwed) * 100) / 100;
    }

    // Generate simplified settlements (minimize transactions)
    const settlements = this.minimizeSettlements(balances);

    return {
      balances: Object.values(balances),
      suggestedSettlements: settlements,
    };
  }

  /**
   * Get balance breakdown for a specific user in a group.
   * Provides the drill-down Rohan wants.
   */
  static async getUserBalance(groupId, userId) {
    const result = await pool.query(
      `SELECT 
        e.id, e.description, e.amount, e.currency, e.date, e.split_type,
        e.paid_by, payer.display_name as payer_name,
        es.share_amount,
        CASE WHEN e.paid_by = $2 THEN e.amount ELSE 0 END as paid_amount
       FROM expense_splits es
       JOIN expenses e ON es.expense_id = e.id
       LEFT JOIN users payer ON e.paid_by = payer.id
       WHERE e.group_id = $1 AND es.user_id = $2 AND e.is_settlement = false
       ORDER BY e.date DESC`,
      [groupId, userId]
    );

    let totalPaid = 0;
    let totalOwed = 0;
    const breakdown = [];

    for (const row of result.rows) {
      let paidINR = parseFloat(row.paid_amount);
      let owedINR = parseFloat(row.share_amount);

      if (row.currency !== 'INR') {
        paidINR = await CurrencyService.convert(paidINR, row.currency, 'INR', row.date);
        owedINR = await CurrencyService.convert(owedINR, row.currency, 'INR', row.date);
      }

      totalPaid += paidINR;
      totalOwed += owedINR;

      breakdown.push({
        expenseId: row.id,
        description: row.description,
        date: row.date,
        amount: parseFloat(row.amount),
        currency: row.currency,
        splitType: row.split_type,
        paidBy: row.payer_name,
        yourShare: parseFloat(row.share_amount),
        yourShareINR: Math.round(owedINR * 100) / 100,
        youPaid: parseFloat(row.paid_amount),
        youPaidINR: Math.round(paidINR * 100) / 100,
        netImpact: Math.round((paidINR - owedINR) * 100) / 100,
      });
    }

    return {
      totalPaid: Math.round(totalPaid * 100) / 100,
      totalOwed: Math.round(totalOwed * 100) / 100,
      netBalance: Math.round((totalPaid - totalOwed) * 100) / 100,
      breakdown,
    };
  }

  /**
   * Minimize the number of settlements needed.
   * Uses a greedy algorithm: match the largest creditor with the largest debtor.
   */
  static minimizeSettlements(balances) {
    const settlements = [];
    const debtors = []; // People who owe money (negative balance)
    const creditors = []; // People who are owed money (positive balance)

    for (const b of Object.values(balances)) {
      if (b.netBalance < -0.01) {
        debtors.push({ ...b, remaining: Math.abs(b.netBalance) });
      } else if (b.netBalance > 0.01) {
        creditors.push({ ...b, remaining: b.netBalance });
      }
    }

    // Sort by amount (largest first)
    debtors.sort((a, b) => b.remaining - a.remaining);
    creditors.sort((a, b) => b.remaining - a.remaining);

    let di = 0, ci = 0;
    while (di < debtors.length && ci < creditors.length) {
      const debtor = debtors[di];
      const creditor = creditors[ci];
      const amount = Math.min(debtor.remaining, creditor.remaining);

      if (amount > 0.01) {
        settlements.push({
          from: { userId: debtor.userId, name: debtor.displayName },
          to: { userId: creditor.userId, name: creditor.displayName },
          amount: Math.round(amount * 100) / 100,
          currency: 'INR',
        });
      }

      debtor.remaining -= amount;
      creditor.remaining -= amount;

      if (debtor.remaining < 0.01) di++;
      if (creditor.remaining < 0.01) ci++;
    }

    return settlements;
  }
}

module.exports = BalanceCalculator;
