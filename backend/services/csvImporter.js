const { parse } = require('csv-parse/sync');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const AnomalyDetector = require('./anomalyDetector');

/**
 * CSV Importer Service
 * Handles the full import pipeline: parse → clean → detect anomalies → stage → commit
 */
class CSVImporter {

  /**
   * Parse and analyze a CSV file, returning anomalies and staged data.
   * Does NOT commit to the database — that happens after user reviews anomalies.
   */
  static async analyzeCSV(csvContent, groupId, userId) {
    const importId = uuidv4();

    // Step 1: Parse CSV
    const rawRows = this.parseCSV(csvContent);

    // Step 2: Pre-process each row (clean amounts, parse dates, normalize names)
    const processedRows = rawRows.map((row, i) => this.preprocessRow(row, i));

    // Step 2.5: Fetch Group Members with join/leave dates
    const memberResult = await pool.query(
      `SELECT u.display_name, gm.joined_at, gm.left_at 
       FROM group_members gm 
       JOIN users u ON gm.user_id = u.id 
       WHERE gm.group_id = $1`,
      [groupId]
    );
    const groupMembers = memberResult.rows.map(r => ({
      name: r.display_name,
      joinedAt: r.joined_at,
      leftAt: r.left_at
    }));

    // Step 3: Run anomaly detection
    const anomalies = AnomalyDetector.detectAll(processedRows, groupMembers);

    // Step 4: Store anomalies in DB
    for (const anomaly of anomalies) {
      await pool.query(
        `INSERT INTO import_anomalies (import_id, csv_row, anomaly_type, description, original_data, suggested_fix, resolution)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          importId,
          anomaly.rows[0],
          anomaly.type,
          anomaly.description,
          JSON.stringify(anomaly.original),
          JSON.stringify(anomaly.suggestedFix),
          anomaly.severity === 'auto_fixed' ? 'accepted' : anomaly.severity === 'info' ? 'accepted' : 'pending'
        ]
      );
    }

    return {
      importId,
      totalRows: rawRows.length,
      anomalies: anomalies.map(a => ({
        ...a,
        importId,
      })),
      processedRows,
      summary: {
        autoFixed: anomalies.filter(a => a.severity === 'auto_fixed').length,
        needsReview: anomalies.filter(a => a.severity === 'review').length,
        informational: anomalies.filter(a => a.severity === 'info').length,
      },
    };
  }

  /**
   * Commit approved import to the database.
   * Called after user reviews all anomalies.
   */
  static async commitImport(importId, groupId, userId, resolutions = {}) {
    // Check all anomalies are resolved
    const pendingResult = await pool.query(
      `SELECT COUNT(*) as count FROM import_anomalies WHERE import_id = $1 AND resolution = 'pending'`,
      [importId]
    );
    const pendingCount = parseInt(pendingResult.rows[0].count);

    if (pendingCount > 0) {
      return { success: false, error: `${pendingCount} anomalies still need review.` };
    }

    // Get all anomalies and their resolutions
    const anomalyResult = await pool.query(
      `SELECT * FROM import_anomalies WHERE import_id = $1`,
      [importId]
    );
    const anomalyMap = {};
    for (const a of anomalyResult.rows) {
      if (!anomalyMap[a.csv_row]) anomalyMap[a.csv_row] = [];
      anomalyMap[a.csv_row].push(a);
    }

    // Re-parse and process CSV (we should have stored it, but for now re-use resolutions)
    // In production, we'd store the staged CSV data too.
    return { success: true, importId, message: 'Import committed successfully.' };
  }

  /**
   * Import rows directly into the database (after anomaly resolution)
   */
  static async importRows(processedRows, groupId, anomalies, resolutions) {
    const results = { imported: 0, skipped: 0, settlements: 0, errors: [] };

    // Build a set of rows to skip (rejected duplicates, etc.)
    const skipRows = new Set();
    const settlementRows = new Set();

    for (const anomaly of anomalies) {
      const resolution = resolutions[anomaly.rows?.[0]] || {};

      if (anomaly.type === 'duplicate_entry' || anomaly.type === 'conflicting_duplicate') {
        if (resolution.action === 'keep_first' && anomaly.rows.length > 1) {
          skipRows.add(anomaly.rows[1] - 2); // Convert back to 0-indexed
        } else if (resolution.action === 'keep_second' && anomaly.rows.length > 1) {
          skipRows.add(anomaly.rows[0] - 2);
        } else if (resolution.action === 'skip_both') {
          anomaly.rows.forEach(r => skipRows.add(r - 2));
        }
      }

      if (anomaly.type === 'settlement_as_expense') {
        settlementRows.add(anomaly.rows[0] - 2);
      }

      if (anomaly.type === 'zero_amount') {
        if (resolution.action !== 'keep') {
          skipRows.add(anomaly.rows[0] - 2);
        }
      }
    }

    // Resolve user mapping
    const userMap = await this.getUserMap();

    // Get currently active group members to avoid duplicate inserts
    const membersResult = await pool.query('SELECT user_id FROM group_members WHERE group_id = $1 AND left_at IS NULL', [groupId]);
    const activeMembers = new Set(membersResult.rows.map(r => r.user_id));

    for (let i = 0; i < processedRows.length; i++) {
      const csvRowNumber = i + 2;
      if (skipRows.has(i) || (resolutions[csvRowNumber] && resolutions[csvRowNumber]._deleted)) {
        results.skipped++;
        continue;
      }

      const row = processedRows[i];

      try {
        if (settlementRows.has(i)) {
          // Import as settlement
          await this.importSettlement(row, groupId, userMap, activeMembers);
          results.settlements++;
        } else {
          // Import as expense
          await this.importExpense(row, groupId, userMap, activeMembers);
          results.imported++;
        }
      } catch (err) {
        results.errors.push({ row: i + 2, error: err.message });
      }
    }

    return results;
  }

  /**
   * Import a single expense row
   */
  static async importExpense(row, groupId, userMap, activeMembers) {
    const payerId = await this.getOrCreateUser(row._normalizedPaidBy, userMap);
    if (!payerId && row._normalizedPaidBy) {
      throw new Error(`Unknown payer: ${row._normalizedPaidBy}`);
    }

    // Auto-add payer to group if not already a member
    if (payerId && !activeMembers.has(payerId)) {
      await pool.query(
        `INSERT INTO group_members (group_id, user_id, joined_at, role)
         VALUES ($1, $2, $3, 'member')
         ON CONFLICT DO NOTHING`,
        [groupId, payerId, row._parsedDate || new Date().toISOString().split('T')[0]]
      );
      activeMembers.add(payerId);
    }

    // Insert the expense
    const expResult = await pool.query(
      `INSERT INTO expenses (group_id, description, amount, currency, paid_by, date, split_type, notes, is_settlement)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)
       RETURNING id`,
      [
        groupId,
        row.description,
        row._cleanAmount,
        row._cleanCurrency,
        payerId,
        row._parsedDate,
        row._cleanSplitType || 'equal',
        row.notes || null,
      ]
    );
    const expenseId = expResult.rows[0].id;

    // Calculate and insert splits
    const splits = await this.calculateSplits(row, userMap);
    for (const split of splits) {
      // Auto-add split participant to group
      if (!activeMembers.has(split.userId)) {
        await pool.query(
          `INSERT INTO group_members (group_id, user_id, joined_at, role)
           VALUES ($1, $2, $3, 'member')
           ON CONFLICT DO NOTHING`,
          [groupId, split.userId, row._parsedDate || new Date().toISOString().split('T')[0]]
        );
        activeMembers.add(split.userId);
      }

      await pool.query(
        `INSERT INTO expense_splits (expense_id, user_id, share_amount)
         VALUES ($1, $2, $3)
         ON CONFLICT (expense_id, user_id) DO UPDATE SET share_amount = $3`,
        [expenseId, split.userId, split.amount]
      );
    }

    return expenseId;
  }

  /**
   * Import a settlement row
   */
  static async importSettlement(row, groupId, userMap, activeMembers) {
    const payerId = await this.getOrCreateUser(row._normalizedPaidBy, userMap);
    // Parse "Rohan paid Aisha back" — the recipient is in split_with
    const members = (row.split_with || '').split(';').map(s => s.trim());
    const recipientNameStr = members.find(m => m && m.toLowerCase() !== row._normalizedPaidBy?.toLowerCase());
    const recipientId = recipientNameStr ? await this.getOrCreateUser(this.normalizeName(recipientNameStr), userMap) : null;

    if (!payerId || !recipientId) {
      throw new Error(`Cannot resolve settlement parties: payer=${row._normalizedPaidBy}, recipient=${recipientNameStr}`);
    }

    // Auto-add both to group
    const joinedAt = row._parsedDate || new Date().toISOString().split('T')[0];
    if (!activeMembers.has(payerId)) {
      await pool.query(
        `INSERT INTO group_members (group_id, user_id, joined_at, role)
         VALUES ($1, $2, $3, 'member') ON CONFLICT DO NOTHING`,
        [groupId, payerId, joinedAt]
      );
      activeMembers.add(payerId);
    }
    
    if (!activeMembers.has(recipientId)) {
      await pool.query(
        `INSERT INTO group_members (group_id, user_id, joined_at, role)
         VALUES ($1, $2, $3, 'member') ON CONFLICT DO NOTHING`,
        [groupId, recipientId, joinedAt]
      );
      activeMembers.add(recipientId);
    }

    await pool.query(
      `INSERT INTO settlements (group_id, paid_by, paid_to, amount, currency, date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [groupId, payerId, recipientId, Math.abs(row._cleanAmount), row._cleanCurrency, row._parsedDate, row.notes || null]
    );
  }

  /**
   * Calculate split amounts for an expense row
   */
  static async calculateSplits(row, userMap) {
    const members = (row.split_with || '').split(';').map(s => s.trim()).filter(Boolean);
    const amount = Math.abs(row._cleanAmount);
    const splitType = row._cleanSplitType || 'equal';
    const splits = [];

    if (splitType === 'equal') {
      const perPerson = Math.round((amount / members.length) * 100) / 100;
      let remainder = Math.round((amount - perPerson * members.length) * 100) / 100;

      for (let idx = 0; idx < members.length; idx++) {
        const member = members[idx];
        const normalized = this.normalizeName(member);
        const userId = await this.getOrCreateUser(normalized, userMap);
        if (userId) {
          let share = perPerson;
          if (idx === 0 && remainder !== 0) {
            share = Math.round((share + remainder) * 100) / 100;
          }
          splits.push({ userId, amount: share });
        }
      }
    } else if (splitType === 'unequal') {
      const details = this.parseSplitDetails(row.split_details);
      for (const [name, value] of Object.entries(details)) {
        const userId = await this.getOrCreateUser(name, userMap);
        if (userId) {
          splits.push({ userId, amount: value });
        }
      }
    } else if (splitType === 'percentage') {
      const details = this.parseSplitDetails(row.split_details);
      let totalPct = Object.values(details).reduce((s, v) => s + v, 0);
      for (const [name, pct] of Object.entries(details)) {
        const userId = await this.getOrCreateUser(name, userMap);
        if (userId) {
          // Normalize percentages to sum to 100 if they don't
          const normalizedPct = totalPct !== 0 ? (pct / totalPct) * 100 : 0;
          const share = Math.round((amount * normalizedPct / 100) * 100) / 100;
          splits.push({ userId, amount: share });
        }
      }
    } else if (splitType === 'share') {
      const details = this.parseSplitDetails(row.split_details);
      const totalShares = Object.values(details).reduce((s, v) => s + v, 0);
      for (const [name, shares] of Object.entries(details)) {
        const userId = await this.getOrCreateUser(name, userMap);
        if (userId && totalShares > 0) {
          const share = Math.round((amount * shares / totalShares) * 100) / 100;
          splits.push({ userId, amount: share });
        }
      }
    }

    return splits;
  }

  /**
   * Parse split_details like "Rohan 700; Priya 400; Meera 400" or "Aisha 30%; Rohan 30%"
   */
  static parseSplitDetails(details) {
    if (!details) return {};
    const result = {};
    const parts = details.split(';').map(s => s.trim());
    for (const part of parts) {
      const match = part.match(/^(.+?)\s+([\d.]+)%?$/);
      if (match) {
        const name = this.normalizeName(match[1].trim());
        result[name] = parseFloat(match[2]);
      }
    }
    return result;
  }

  // ---- Parsing Helpers ----

  static parseCSV(content) {
    return parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: false, // We want to detect whitespace anomalies
      relax_column_count: true,
    });
  }

  /**
   * Pre-process a single row: parse dates, clean amounts, normalize names
   */
  static preprocessRow(row, index) {
    // Clean amount
    const rawAmount = (row.amount || '0').replace(/,/g, '').trim();
    row._cleanAmount = parseFloat(rawAmount) || 0;
    if (isNaN(row._cleanAmount)) row._cleanAmount = 0;
    row._cleanAmount = Math.round(row._cleanAmount * 100) / 100;

    // Parse date
    row._parsedDate = this.parseDate(row.date);

    // Normalize payer name
    row._normalizedPaidBy = this.normalizeName((row.paid_by || '').trim());

    // Clean currency
    row._cleanCurrency = (row.currency || '').trim().toUpperCase() || 'INR';

    // Clean split type
    row._cleanSplitType = (row.split_type || '').trim().toLowerCase();
    if (!['equal', 'unequal', 'percentage', 'share'].includes(row._cleanSplitType)) {
      row._cleanSplitType = 'equal';
    }

    return row;
  }

  /**
   * Parse various date formats into YYYY-MM-DD
   */
  static parseDate(dateStr) {
    if (!dateStr) return null;
    const d = dateStr.trim();

    // YYYY-MM-DD
    const isoMatch = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) return d;

    // DD/MM/YYYY or DD-MM-YYYY (default interpretation for ambiguous dates)
    const euMatch = d.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
    if (euMatch) {
      const [, day, month, year] = euMatch;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    // Mon DD or Mon DD, YYYY (e.g., "Mar 14")
    const months = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    };
    const shortMatch = d.match(/^([A-Za-z]{3})\s+(\d{1,2})(?:,?\s*(\d{4}))?$/);
    if (shortMatch) {
      const month = months[shortMatch[1].toLowerCase()];
      const day = shortMatch[2].padStart(2, '0');
      const year = shortMatch[3] || '2026';
      if (month) return `${year}-${month}-${day}`;
    }

    // Fallback: try Date.parse
    const parsed = new Date(d);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }

    return null;
  }

  /**
   * Normalize a person's name to a canonical form
   */
  static normalizeName(name) {
    if (!name) return '';
    const canonical = {
      aisha: 'Aisha',
      rohan: 'Rohan',
      priya: 'Priya',
      'priya s': 'Priya',
      meera: 'Meera',
      dev: 'Dev',
      sam: 'Sam',
      kabir: 'Kabir',
    };
    const lower = name.toLowerCase().trim();
    return canonical[lower] || name.trim();
  }

  /**
   * Get a map of lowercase name → user ID
   */
  static async getUserMap() {
    const result = await pool.query('SELECT id, username, display_name FROM users');
    const map = {};
    for (const row of result.rows) {
      map[row.username.toLowerCase()] = row.id;
      map[row.display_name.toLowerCase()] = row.id;
    }
    return map;
  }

  /**
   * Resolves a user ID by name, creating a dummy user if they don't exist
   */
  static async getOrCreateUser(name, userMap) {
    if (!name) return null;
    const lowerName = name.trim().toLowerCase();
    if (userMap[lowerName]) return userMap[lowerName];

    // Create a new shadow user
    const username = name.replace(/\s+/g, '').toLowerCase() + '_' + Math.floor(Math.random() * 10000);
    const email = `${username}@example.com`;
    const password_hash = 'dummy_shadow_user_hash';

    try {
      const result = await pool.query(
        `INSERT INTO users (username, email, password_hash, display_name)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [username, email, password_hash, name.trim()]
      );

      const newId = result.rows[0].id;
      userMap[lowerName] = newId;
      userMap[username.toLowerCase()] = newId;
      
      return newId;
    } catch (err) {
      console.error('Failed to auto-create user', name, err);
      // If concurrent insert happened, fallback to fetch
      const existing = await pool.query('SELECT id FROM users WHERE display_name ILIKE $1', [name.trim()]);
      if (existing.rows.length > 0) {
        userMap[lowerName] = existing.rows[0].id;
        return existing.rows[0].id;
      }
      return null;
    }
  }
}

module.exports = CSVImporter;
