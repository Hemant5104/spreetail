const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function initDatabase() {
  try {
    console.log('Initializing database...');
    
    // Read and execute schema
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(schema);
    console.log('Schema created successfully.');

    // Read and execute seed data
    const seed = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
    await pool.query(seed);
    console.log('Seed data inserted successfully.');

    // Insert default exchange rate
    await pool.query(`
      INSERT INTO exchange_rates (from_currency, to_currency, rate, effective_date)
      VALUES ('USD', 'INR', $1, '2026-01-01')
      ON CONFLICT (from_currency, to_currency, effective_date) DO NOTHING
    `, [process.env.USD_TO_INR_RATE || 83.50]);
    console.log('Default exchange rate set.');

    console.log('Database initialization complete!');
  } catch (err) {
    console.error('Database initialization failed:', err);
  } finally {
    await pool.end();
  }
}

initDatabase();
