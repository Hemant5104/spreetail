# SCOPE: Anomaly Log & Database Schema

## Part 1: Anomaly Log

When the importer processes the CSV, it looks for structural and contextual inconsistencies. We categorized these into three severity levels: Auto-fixed, Review-required, and Informational.

### Anomalies Detected & Handling Policies

1. **Missing Payer (`missing_payer`)**
   * **Problem:** Some expenses don't specify who paid.
   * **Policy (Auto-fixed):** Defaulted the payer to the user performing the CSV upload, assuming they are importing their own expenses.

2. **Negative Amounts (`negative_amount`)**
   * **Problem:** Amounts appearing as less than zero.
   * **Policy (Review-required):** Displayed to the user to decide if it's a "refund" (to be subtracted) or a "data entry error" (take the absolute value).

3. **Zero Amounts (`zero_amount`)**
   * **Problem:** Expense amount is 0.
   * **Policy (Review-required):** Ask the user whether to "Skip" the row entirely or "Keep" it for ledger tracking.

4. **Missing Currency (`missing_currency`)**
   * **Problem:** Currency column is blank.
   * **Policy (Auto-fixed):** Defaulted to `INR` (Indian Rupee) as the base app currency.

5. **Inconsistent Date Formats (`invalid_date_format`)**
   * **Problem:** Dates look like `2026-03-14`, `14/03/2026`, or `Mar 14`.
   * **Policy (Auto-fixed):** Passed through a multi-strategy regex parser to normalize all dates to ISO `YYYY-MM-DD`.

6. **Missing Dates (`missing_date`)**
   * **Problem:** Row has no date attached.
   * **Policy (Auto-fixed):** Defaulted to the date of the CSV import execution (`CURRENT_DATE`).

7. **Duplicate Entries (`duplicate_entry` / `conflicting_duplicate`)**
   * **Problem:** Two rows exist with the same description, payer, and date.
   * **Policy (Review-required):** Presented side-by-side to the user. User can choose "Keep First", "Keep Second", or "Skip Both".

8. **Inconsistent Naming (`inconsistent_name`)**
   * **Problem:** Names like "Aisha" vs "Aisha M." or trailing spaces.
   * **Policy (Auto-fixed):** Normalized all names by trimming whitespace, casting to lowercase, and mapping to canonical User IDs from the `users` table.

9. **Settlement Logged as Expense (`settlement_as_expense`)**
   * **Problem:** Rows explicitly described as "Rohan paid Aisha back" were logged in the spreadsheet as expenses.
   * **Policy (Informational / Handled):** Natural language detection picks up terms like "paid back". It extracts the payer and recipient from the `split_with` column, bypasses the `expenses` table, and inserts the row directly into the `settlements` table.

10. **Moved-Out Members on Late Dates (`date_mismatch_member`)**
    * **Problem:** Meera moved out in March, but is billed for a trip in April.
    * **Policy (Informational):** The engine cross-references the row's parsed date against `left_at` and `joined_at` dates in `group_members` to warn the user that a participant was not actively in the group when the expense occurred.

11. **Foreign Currency Conversion (`foreign_currency`)**
    * **Problem:** USD entries mixed with INR.
    * **Policy (Review-required):** Prompts the user to define a conversion rate on import, normalizing to the group's base currency, or retains the native currency if multi-currency ledgers are preferred.

12. **Mismatched Split Math (`split_math_error`)**
    * **Problem:** Custom percentages or exact amounts in the `split_details` column do not add up to the total expense amount.
    * **Policy (Auto-fixed):** The backend dynamically normalizes the fractional remainders across participants so the sum strictly equals the principal amount.

---

## Part 2: Database Schema

The database was strictly built using Relational DB principles (PostgreSQL).

```sql
-- Core user entity
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100) NOT NULL
);

-- Groups entity
CREATE TABLE groups (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  created_by INT REFERENCES users(id)
);

-- Membership mapping (handles join/leave times)
CREATE TABLE group_members (
  id SERIAL PRIMARY KEY,
  group_id INT REFERENCES groups(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id),
  joined_at DATE NOT NULL,
  left_at DATE,
  role VARCHAR(20) DEFAULT 'member'
);

-- Master expense log
CREATE TABLE expenses (
  id SERIAL PRIMARY KEY,
  group_id INT REFERENCES groups(id) ON DELETE CASCADE,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'INR',
  paid_by INT REFERENCES users(id),
  date DATE NOT NULL,
  split_type VARCHAR(20) NOT NULL
);

-- Per-user breakdown for each expense
CREATE TABLE expense_splits (
  id SERIAL PRIMARY KEY,
  expense_id INT REFERENCES expenses(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id),
  share_amount DECIMAL(12,2) NOT NULL,
  UNIQUE(expense_id, user_id)
);

-- Ledger for debt payments
CREATE TABLE settlements (
  id SERIAL PRIMARY KEY,
  group_id INT REFERENCES groups(id) ON DELETE CASCADE,
  paid_by INT REFERENCES users(id),
  paid_to INT REFERENCES users(id),
  amount DECIMAL(12,2) NOT NULL,
  date DATE NOT NULL
);

-- Staging area for CSV import reviews
CREATE TABLE import_anomalies (
  id SERIAL PRIMARY KEY,
  import_id UUID NOT NULL,
  csv_row INT NOT NULL,
  anomaly_type VARCHAR(50) NOT NULL,
  resolution VARCHAR(20) DEFAULT 'pending'
);
```
