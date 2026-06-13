const pool = require('../db/pool');
require('dotenv').config();

/**
 * Currency Service
 * Handles exchange rate lookups and currency conversion
 */
class CurrencyService {
  /**
   * Get the exchange rate for a given currency pair on a given date.
   * Falls back to the most recent rate before that date.
   */
  static async getRate(fromCurrency, toCurrency, date) {
    if (fromCurrency === toCurrency) return 1.0;

    // Try to find rate for exact date or most recent before
    const result = await pool.query(
      `SELECT rate FROM exchange_rates
       WHERE from_currency = $1 AND to_currency = $2
         AND effective_date <= $3
       ORDER BY effective_date DESC
       LIMIT 1`,
      [fromCurrency, toCurrency, date]
    );

    if (result.rows.length > 0) {
      return parseFloat(result.rows[0].rate);
    }

    // Try reverse direction
    const reverse = await pool.query(
      `SELECT rate FROM exchange_rates
       WHERE from_currency = $1 AND to_currency = $2
         AND effective_date <= $3
       ORDER BY effective_date DESC
       LIMIT 1`,
      [toCurrency, fromCurrency, date]
    );

    if (reverse.rows.length > 0) {
      return 1.0 / parseFloat(reverse.rows[0].rate);
    }

    // Fallback to env default for USD/INR
    if (fromCurrency === 'USD' && toCurrency === 'INR') {
      return parseFloat(process.env.USD_TO_INR_RATE) || 83.50;
    }
    if (fromCurrency === 'INR' && toCurrency === 'USD') {
      return 1.0 / (parseFloat(process.env.USD_TO_INR_RATE) || 83.50);
    }

    throw new Error(`No exchange rate found for ${fromCurrency} → ${toCurrency}`);
  }

  /**
   * Convert an amount from one currency to another
   */
  static async convert(amount, fromCurrency, toCurrency, date) {
    const rate = await this.getRate(fromCurrency, toCurrency, date);
    return Math.round(amount * rate * 100) / 100;
  }

  /**
   * Set or update an exchange rate
   */
  static async setRate(fromCurrency, toCurrency, rate, effectiveDate) {
    await pool.query(
      `INSERT INTO exchange_rates (from_currency, to_currency, rate, effective_date)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (from_currency, to_currency, effective_date) DO UPDATE SET rate = $3`,
      [fromCurrency, toCurrency, rate, effectiveDate]
    );
  }
}

module.exports = CurrencyService;
