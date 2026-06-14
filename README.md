# ClearShare Shared Expenses App

A full-stack application for managing shared group expenses, calculating balances, handling settlements, and importing/reviewing complex expense data from CSV files.

## Features
- **Authentication**: JWT-based user login and registration.
- **Groups**: Create groups and add members.
- **Expenses**: Log expenses with `equal`, `unequal`, `percentage`, and `share` split types.
- **Balances**: Real-time balance calculations showing who owes who.
- **Settlements**: Log direct payments between users to clear debt.
- **CSV Import & Anomaly Detection**: Upload CSV exports from other apps. The system automatically flags 18 different types of errors/anomalies (e.g. duplicate entries, missing payers, stale members, settlement misclassifications) and presents an intuitive "Error Review Wizard" UI to fix them before importing.

## Tech Stack

### 3. Frontend Setup
1. In a new terminal, navigate to the frontend directory and install dependencies:
   ```bash
   cd frontend
   npm install
   ```
2. Start the Vite development server:
   ```bash
   npm run dev
   ```
   *The frontend runs on `http://localhost:5173`*

## How to use the AI-assisted Import Engine
1. Log in using the default user (`testuser` / `password123`) or create an account.
2. Navigate to the **Groups** tab and create a new group.
3. Navigate to the **Import** tab and drag-and-drop the provided `expenses_export.csv`.
4. The backend will parse the file, detect data anomalies, and present a 3-tab review UI (Auto-Fixed, Needs Review, Info).
5. Resolve the conflicts and hit **Commit Import**.
6. View the results dynamically updating in the **Expenses** and **Balances** tabs.

## AI Used
This project was built primarily in collaboration with **Antigravity (Gemini/Claude)**. See `AI_USAGE.md` for a detailed breakdown of the prompts, failure cases, and corrections during development.
