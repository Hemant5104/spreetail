/**
 * Anomaly Detector
 * Detects all 18 categories of data problems in the CSV import.
 * Each detector returns an array of anomaly objects.
 */

class AnomalyDetector {

  /**
   * Run all anomaly detection rules on parsed rows.
   * @param {Array} rows - Array of parsed CSV row objects (raw strings)
   * @returns {Array} anomalies - Array of { row, type, description, original, suggestedFix, severity }
   */
  static detectAll(rows) {
    const anomalies = [];
    const detectors = [
      this.detectDuplicateEntries,
      this.detectCommaInAmount,
      this.detectFractionalAmount,
      this.detectInconsistentNames,
      this.detectMissingPayer,
      this.detectSettlementAsExpense,
      this.detectBadPercentages,
      this.detectInconsistentDateFormats,
      this.detectMixedCurrencies,
      this.detectPotentialDuplicateDinner,
      this.detectNegativeAmount,
      this.detectMissingCurrency,
      this.detectAmountWithSpaces,
      this.detectZeroAmount,
      this.detectAmbiguousDate,
      this.detectStaleMember,
      this.detectConflictingSplitType,
      this.detectNonGroupMember,
    ];

    for (const detector of detectors) {
      try {
        const found = detector.call(this, rows);
        anomalies.push(...found);
      } catch (err) {
        console.error(`Anomaly detector error: ${err.message}`);
      }
    }

    return anomalies;
  }

  /**
   * 1. Duplicate entries: same date + similar description + same amount + same payer
   */
  static detectDuplicateEntries(rows) {
    const anomalies = [];
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i], b = rows[j];
        if (a._parsedDate && b._parsedDate &&
            a._parsedDate === b._parsedDate &&
            a._cleanAmount === b._cleanAmount &&
            a._normalizedPaidBy === b._normalizedPaidBy &&
            a._normalizedPaidBy) {
          const simDesc = this.similarDescriptions(a.description, b.description);
          if (simDesc) {
            anomalies.push({
              rows: [i + 2, j + 2], // +2 for 1-indexed + header
              type: 'duplicate_entry',
              description: `Possible duplicate: Row ${i + 2} "${a.description}" and Row ${j + 2} "${b.description}" — same date, payer, and amount.`,
              original: { row1: a, row2: b },
              suggestedFix: { action: 'keep_first', keepRow: i + 2, removeRow: j + 2 },
              severity: 'review',
            });
          }
        }
      }
    }
    return anomalies;
  }

  /**
   * 2. Comma in amount: e.g., "1,200"
   */
  static detectCommaInAmount(rows) {
    const anomalies = [];
    rows.forEach((row, i) => {
      if (row.amount && row.amount.includes(',')) {
        anomalies.push({
          rows: [i + 2],
          type: 'comma_in_amount',
          description: `Amount "${row.amount}" contains commas. Auto-fixed to "${row.amount.replace(/,/g, '')}".`,
          original: { amount: row.amount },
          suggestedFix: { amount: row.amount.replace(/,/g, '') },
          severity: 'auto_fixed',
        });
      }
    });
    return anomalies;
  }

  /**
   * 3. Fractional amount with more than 2 decimal places
   */
  static detectFractionalAmount(rows) {
    const anomalies = [];
    rows.forEach((row, i) => {
      const clean = (row.amount || '').replace(/,/g, '').trim();
      const num = parseFloat(clean);
      if (!isNaN(num)) {
        const decimals = clean.includes('.') ? clean.split('.')[1].length : 0;
        if (decimals > 2) {
          anomalies.push({
            rows: [i + 2],
            type: 'fractional_amount',
            description: `Amount "${row.amount}" has ${decimals} decimal places. Rounded to ${num.toFixed(2)}.`,
            original: { amount: row.amount },
            suggestedFix: { amount: num.toFixed(2) },
            severity: 'auto_fixed',
          });
        }
      }
    });
    return anomalies;
  }

  /**
   * 4. Inconsistent payer names (case variations, extra suffixes)
   */
  static detectInconsistentNames(rows) {
    const anomalies = [];
    const nameMap = {};

    // Canonical names
    const canonicalNames = ['Aisha', 'Rohan', 'Priya', 'Meera', 'Dev', 'Sam', 'Kabir'];

    rows.forEach((row, i) => {
      const raw = (row.paid_by || '').trim();
      if (!raw) return;

      const matched = canonicalNames.find(c => c.toLowerCase() === raw.toLowerCase().replace(/\s+\w*$/, ''));
      if (matched && raw !== matched) {
        anomalies.push({
          rows: [i + 2],
          type: 'inconsistent_name',
          description: `Payer "${raw}" normalized to "${matched}".`,
          original: { paid_by: raw },
          suggestedFix: { paid_by: matched },
          severity: 'auto_fixed',
        });
      }
    });
    return anomalies;
  }

  /**
   * 5. Missing payer
   */
  static detectMissingPayer(rows) {
    const anomalies = [];
    rows.forEach((row, i) => {
      if (!row.paid_by || !row.paid_by.trim()) {
        anomalies.push({
          rows: [i + 2],
          type: 'missing_payer',
          description: `No payer specified for "${row.description}". User must assign a payer.`,
          original: { paid_by: row.paid_by },
          suggestedFix: { action: 'user_must_assign_payer' },
          severity: 'review',
        });
      }
    });
    return anomalies;
  }

  /**
   * 6. Settlement logged as expense
   */
  static detectSettlementAsExpense(rows) {
    const anomalies = [];
    const settlementPatterns = [
      /paid\s+\w+\s+back/i,
      /settlement/i,
      /repaid/i,
      /payback/i,
    ];
    rows.forEach((row, i) => {
      const desc = row.description || '';
      const notes = row.notes || '';
      const noSplitType = !row.split_type || !row.split_type.trim();
      const isSettlement = settlementPatterns.some(p => p.test(desc)) ||
                           /settlement/i.test(notes) ||
                           (noSplitType && /paid.*back/i.test(desc));
      if (isSettlement) {
        anomalies.push({
          rows: [i + 2],
          type: 'settlement_as_expense',
          description: `"${desc}" appears to be a settlement, not an expense. Will be converted to a payment record.`,
          original: { description: desc, split_type: row.split_type },
          suggestedFix: { action: 'convert_to_settlement' },
          severity: 'review',
        });
      }
    });
    return anomalies;
  }

  /**
   * 7. Percentages don't add to 100%
   */
  static detectBadPercentages(rows) {
    const anomalies = [];
    rows.forEach((row, i) => {
      if (row.split_type !== 'percentage' || !row.split_details) return;
      const parts = row.split_details.split(';').map(s => s.trim());
      let total = 0;
      for (const part of parts) {
        const match = part.match(/([\d.]+)%/);
        if (match) total += parseFloat(match[1]);
      }
      if (Math.abs(total - 100) > 0.01) {
        anomalies.push({
          rows: [i + 2],
          type: 'bad_percentages',
          description: `Percentages sum to ${total}% instead of 100% for "${row.description}". User must correct.`,
          original: { split_details: row.split_details, total },
          suggestedFix: { action: 'normalize_percentages', normalized_total: 100 },
          severity: 'review',
        });
      }
    });
    return anomalies;
  }

  /**
   * 8. Inconsistent date formats
   */
  static detectInconsistentDateFormats(rows) {
    const anomalies = [];
    const isoPattern = /^\d{4}-\d{2}-\d{2}$/;
    const dmyPattern = /^\d{2}\/\d{2}\/\d{4}$/;
    const mdyPattern = /^\d{2}\/\d{2}\/\d{4}$/; // Same pattern, contextually different
    const shortPattern = /^[A-Za-z]{3}\s+\d{1,2}$/;

    rows.forEach((row, i) => {
      const d = (row.date || '').trim();
      if (!d) return;
      if (!isoPattern.test(d)) {
        anomalies.push({
          rows: [i + 2],
          type: 'inconsistent_date',
          description: `Date "${d}" is not in YYYY-MM-DD format. Parsed as "${row._parsedDate || 'UNKNOWN'}".`,
          original: { date: d },
          suggestedFix: { date: row._parsedDate },
          severity: 'info',
        });
      }
    });
    return anomalies;
  }

  /**
   * 9. Mixed currencies (informational)
   */
  static detectMixedCurrencies(rows) {
    const anomalies = [];
    const currencies = new Set(rows.map(r => (r.currency || '').trim().toUpperCase()).filter(Boolean));
    if (currencies.size > 1) {
      const usdRows = rows.filter((r, i) => (r.currency || '').trim().toUpperCase() === 'USD').map((r, i) => {
        const idx = rows.indexOf(r);
        return idx + 2;
      });
      anomalies.push({
        rows: usdRows,
        type: 'mixed_currencies',
        description: `Multiple currencies detected (${[...currencies].join(', ')}). USD expenses will be converted at configured rate.`,
        original: { currencies: [...currencies] },
        suggestedFix: { action: 'convert_at_rate' },
        severity: 'info',
      });
    }
    return anomalies;
  }

  /**
   * 10. Potential duplicate dinner at Thalassa (different payers/amounts)
   */
  static detectPotentialDuplicateDinner(rows) {
    const anomalies = [];
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i], b = rows[j];
        if (a._parsedDate && b._parsedDate &&
            a._parsedDate === b._parsedDate &&
            a._cleanAmount !== b._cleanAmount &&
            this.similarDescriptions(a.description, b.description)) {
          // Different amounts or payers — possible conflict
          if (a._normalizedPaidBy !== b._normalizedPaidBy || a._cleanAmount !== b._cleanAmount) {
            anomalies.push({
              rows: [i + 2, j + 2],
              type: 'conflicting_duplicate',
              description: `Possible conflicting entries: Row ${i + 2} "${a.description}" (${a.amount} by ${a.paid_by}) vs Row ${j + 2} "${b.description}" (${b.amount} by ${b.paid_by}). User must resolve.`,
              original: { row1: a, row2: b },
              suggestedFix: { action: 'user_must_resolve' },
              severity: 'review',
            });
          }
        }
      }
    }
    return anomalies;
  }

  /**
   * 11. Negative amount (refund)
   */
  static detectNegativeAmount(rows) {
    const anomalies = [];
    rows.forEach((row, i) => {
      if (row._cleanAmount < 0) {
        anomalies.push({
          rows: [i + 2],
          type: 'negative_amount',
          description: `Negative amount ${row.amount} for "${row.description}". Treated as refund/credit.`,
          original: { amount: row.amount },
          suggestedFix: { action: 'treat_as_refund' },
          severity: 'info',
        });
      }
    });
    return anomalies;
  }

  /**
   * 12. Missing currency
   */
  static detectMissingCurrency(rows) {
    const anomalies = [];
    rows.forEach((row, i) => {
      if (!row.currency || !row.currency.trim()) {
        anomalies.push({
          rows: [i + 2],
          type: 'missing_currency',
          description: `No currency specified for "${row.description}". Defaulting to INR.`,
          original: { currency: row.currency },
          suggestedFix: { currency: 'INR' },
          severity: 'review',
        });
      }
    });
    return anomalies;
  }

  /**
   * 13. Amount with leading/trailing spaces
   */
  static detectAmountWithSpaces(rows) {
    const anomalies = [];
    rows.forEach((row, i) => {
      if (row.amount && row.amount !== row.amount.trim() && row.amount.trim()) {
        anomalies.push({
          rows: [i + 2],
          type: 'amount_whitespace',
          description: `Amount "${row.amount}" has extra whitespace. Auto-trimmed to "${row.amount.trim()}".`,
          original: { amount: row.amount },
          suggestedFix: { amount: row.amount.trim() },
          severity: 'auto_fixed',
        });
      }
    });
    return anomalies;
  }

  /**
   * 14. Zero amount
   */
  static detectZeroAmount(rows) {
    const anomalies = [];
    rows.forEach((row, i) => {
      if (row._cleanAmount === 0 && row.amount !== undefined) {
        anomalies.push({
          rows: [i + 2],
          type: 'zero_amount',
          description: `Zero amount for "${row.description}". ${row.notes || 'No notes.'}. User should delete or update.`,
          original: { amount: row.amount, notes: row.notes },
          suggestedFix: { action: 'skip_or_update' },
          severity: 'review',
        });
      }
    });
    return anomalies;
  }

  /**
   * 15. Ambiguous date (DD/MM vs MM/DD when both are valid)
   */
  static detectAmbiguousDate(rows) {
    const anomalies = [];
    rows.forEach((row, i) => {
      const d = (row.date || '').trim();
      const match = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (match) {
        const [, a, b, year] = match;
        const aNum = parseInt(a), bNum = parseInt(b);
        // Both could be day or month (both <= 12)
        if (aNum <= 12 && bNum <= 12 && aNum !== bNum) {
          anomalies.push({
            rows: [i + 2],
            type: 'ambiguous_date',
            description: `Date "${d}" is ambiguous — could be ${a}/${b} (DD/MM) or ${b}/${a} (MM/DD). ${row.notes || ''}. Parsed as DD/MM/YYYY → ${row._parsedDate}. User should verify.`,
            original: { date: d },
            suggestedFix: { date: row._parsedDate, interpretation: 'DD/MM/YYYY' },
            severity: 'review',
          });
        }
      }
    });
    return anomalies;
  }

  /**
   * 16. Stale group member (person included after they left)
   */
  static detectStaleMember(rows) {
    const anomalies = [];
    // Meera left at end of March 2026
    const meeraLeftDate = '2026-03-31';

    rows.forEach((row, i) => {
      if (!row._parsedDate || !row.split_with) return;
      const members = row.split_with.split(';').map(s => s.trim().toLowerCase());
      const hasMemera = members.includes('meera');
      if (hasMemera && row._parsedDate > meeraLeftDate) {
        anomalies.push({
          rows: [i + 2],
          type: 'stale_member',
          description: `Meera is included in "${row.description}" (${row._parsedDate}) but left the group on ${meeraLeftDate}. User should verify.`,
          original: { split_with: row.split_with, date: row._parsedDate },
          suggestedFix: { action: 'remove_meera_from_split' },
          severity: 'review',
        });
      }
    });
    return anomalies;
  }

  /**
   * 17. Conflicting split_type and split_details
   */
  static detectConflictingSplitType(rows) {
    const anomalies = [];
    rows.forEach((row, i) => {
      if (row.split_type === 'equal' && row.split_details && row.split_details.trim()) {
        anomalies.push({
          rows: [i + 2],
          type: 'conflicting_split',
          description: `Split type is "equal" but split details are provided: "${row.split_details}". Ignoring split details and using equal split.`,
          original: { split_type: row.split_type, split_details: row.split_details },
          suggestedFix: { action: 'ignore_details_use_equal' },
          severity: 'info',
        });
      }
    });
    return anomalies;
  }

  /**
   * 18. Non-group member (one-time participant)
   */
  static detectNonGroupMember(rows) {
    const anomalies = [];
    const knownMembers = ['aisha', 'rohan', 'priya', 'meera', 'dev', 'sam'];

    rows.forEach((row, i) => {
      if (!row.split_with) return;
      const members = row.split_with.split(';').map(s => s.trim().toLowerCase());
      const unknown = members.filter(m => {
        const clean = m.replace(/[^a-z]/g, '');
        return clean && !knownMembers.includes(clean);
      });
      if (unknown.length > 0) {
        anomalies.push({
          rows: [i + 2],
          type: 'non_group_member',
          description: `Unknown participant(s) "${unknown.join(', ')}" in "${row.description}". Will be added as guest(s).`,
          original: { split_with: row.split_with, unknown },
          suggestedFix: { action: 'add_as_guest' },
          severity: 'info',
        });
      }
    });
    return anomalies;
  }

  // ---- Helpers ----

  /**
   * Check if two descriptions are similar enough to be duplicates
   */
  static similarDescriptions(a, b) {
    if (!a || !b) return false;
    const normalize = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const na = normalize(a), nb = normalize(b);
    if (na === nb) return true;
    // Check if one contains the other or has high overlap
    if (na.includes(nb) || nb.includes(na)) return true;
    // Simple word overlap
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));
    const intersection = [...wordsA].filter(w => wordsB.has(w));
    const union = new Set([...wordsA, ...wordsB]);
    return intersection.length / union.size > 0.5;
  }
}

module.exports = AnomalyDetector;
