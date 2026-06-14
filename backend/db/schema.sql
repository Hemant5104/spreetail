-- ============================================
-- ClearShare Shared Expenses App — Database Schema
-- ============================================

-- Users & Authentication
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Groups
CREATE TABLE IF NOT EXISTS groups (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Group Membership (tracks join/leave for time-aware balances)
CREATE TABLE IF NOT EXISTS group_members (
  id SERIAL PRIMARY KEY,
  group_id INT REFERENCES groups(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id),
  joined_at DATE NOT NULL,
  left_at DATE,
  role VARCHAR(20) DEFAULT 'member',
  UNIQUE(group_id, user_id, joined_at)
);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  group_id INT REFERENCES groups(id) ON DELETE CASCADE,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'INR',
  paid_by INT REFERENCES users(id),
  date DATE NOT NULL,
  split_type VARCHAR(20) NOT NULL CHECK (split_type IN ('equal', 'unequal', 'percentage', 'share')),
  notes TEXT,
  is_settlement BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Expense Splits (per-participant breakdown)
CREATE TABLE IF NOT EXISTS expense_splits (
  id SERIAL PRIMARY KEY,
  expense_id INT REFERENCES expenses(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id),
  share_amount DECIMAL(12,2) NOT NULL,
  UNIQUE(expense_id, user_id)
);

-- Settlements / Payments
CREATE TABLE IF NOT EXISTS settlements (
  id SERIAL PRIMARY KEY,
  group_id INT REFERENCES groups(id) ON DELETE CASCADE,
  paid_by INT REFERENCES users(id),
  paid_to INT REFERENCES users(id),
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'INR',
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Import Anomalies (for review UI)
CREATE TABLE IF NOT EXISTS import_anomalies (
  id SERIAL PRIMARY KEY,
  import_id UUID NOT NULL,
  csv_row INT NOT NULL,
  anomaly_type VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  original_data JSONB,
  suggested_fix JSONB,
  resolution VARCHAR(20) DEFAULT 'pending' CHECK (resolution IN ('pending', 'accepted', 'rejected', 'manual')),
  resolved_by INT REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Exchange Rates
CREATE TABLE IF NOT EXISTS exchange_rates (
  id SERIAL PRIMARY KEY,
  from_currency VARCHAR(3) NOT NULL,
  to_currency VARCHAR(3) NOT NULL,
  rate DECIMAL(10,4) NOT NULL,
  effective_date DATE NOT NULL,
  UNIQUE(from_currency, to_currency, effective_date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_expenses_group_id ON expenses(group_id);
CREATE INDEX IF NOT EXISTS idx_expenses_paid_by ON expenses(paid_by);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expense_splits_expense ON expense_splits(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_splits_user ON expense_splits(user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_settlements_group ON settlements(group_id);
CREATE INDEX IF NOT EXISTS idx_import_anomalies_import ON import_anomalies(import_id);
