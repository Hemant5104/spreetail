# DECISIONS: Engineering & Product Log

## 1. Choice of Tech Stack (React + Node.js + PostgreSQL)
**Options considered:** 
* Django/Python + SQLite
* Next.js Full Stack (Server Actions) + Prisma
* React SPA + Express.js API + Raw PostgreSQL 

**Decision & Why:**
We chose React + Express + Raw PostgreSQL (`pg` pool). We avoided heavy ORMs (like Prisma) because the evaluation explicitly requires walking through and explaining the math and database structures live. Using raw SQL makes the relational data model completely transparent. Express + React creates a clean separation of concerns, allowing the Anomaly Engine to be an isolated backend service.

## 2. Handling CSV Anomalies
**Options considered:**
* Silent fallback: Automatically guess the user's intent and ingest everything.
* Hard crash: Fail the import entirely on the first malformed row.
* Staging Review Area: Ingest CSV into memory/temp tables, run validations, and wait for human review.

**Decision & Why:**
We chose the **Staging Review Area**. A silent guess fails the assignment requirements, and a hard crash is terrible UX. By staging anomalies in the `import_anomalies` table, we allow the user to review the data exactly like resolving git conflicts. Auto-fixable data (like missing currencies or date formats) is fixed automatically but surfaced transparently under an "Auto-Fixed" tab.

## 3. Dealing with "Settlements Logged as Expenses"
**Options considered:**
* Leave them as expenses with a negative split.
* Build a natural language parser to bypass the expense table entirely.

**Decision & Why:**
We opted to bypass the `expenses` table. The CSV engine detects phrases like "paid back". It extracts the payer and recipient from the `split_with` column and inserts the transaction directly into the `settlements` table. This keeps the ledger pure and correctly reduces the net balance without artificially inflating group "total spending."

## 4. Time-Aware Balances (Join & Leave Dates)
**Options considered:**
* Soft-deleting users from groups.
* Hard-deleting users from groups.
* Tracking `joined_at` and `left_at` timestamps.

**Decision & Why:**
We chose `joined_at` and `left_at` in the `group_members` table. Hard deleting a user breaks foreign key constraints on past expenses. Soft deleting hides them, but they still owe money. Tracking the timeframe allows the engine to calculate balances strictly for expenses that occurred *during* their tenure, directly satisfying Sam's request: *"Why would March electricity affect my balance?"*

## 5. UI/UX Aesthetics
**Options considered:**
* Standard component library (MUI, Tailwind, Bootstrap).
* Custom CSS variables + Glassmorphism.

**Decision & Why:**
We chose a custom, framework-free CSS Variable design system. We wanted to demonstrate strong frontend fundamentals rather than reliance on utility classes. It provides a highly premium "WOW" factor (dark mode, blurred overlays, gradients) while keeping the bundle size microscopic.
