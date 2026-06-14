const pool = require('./backend/db/pool');

async function migrate() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS import_history (
        id SERIAL PRIMARY KEY,
        import_id UUID UNIQUE NOT NULL,
        group_id INT REFERENCES groups(id) ON DELETE CASCADE,
        imported_by INT REFERENCES users(id) ON DELETE SET NULL,
        total_rows INT,
        imported_rows INT,
        skipped_rows INT,
        settlements_created INT,
        edited_rows JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_import_history_group ON import_history(group_id);
    `);
    console.log('Migration successful');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
