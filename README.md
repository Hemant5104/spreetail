# Spreetail Shared Expenses App

A full-stack web application designed to solve complex shared expenses, featuring a robust CSV anomaly detection engine.

## Tech Stack
- **Frontend**: React (Vite), CSS Variables (Custom glassmorphism design system)
- **Backend**: Node.js, Express, Axios
- **Database**: PostgreSQL (Relational DB)
- **Authentication**: JWT (JSON Web Tokens)

## Setup Instructions

### 1. Database Setup
1. Ensure PostgreSQL 18 is installed and running.
2. The application expects the `postgres` user password to be `ujjwal51`.
3. In the root `backend` directory, run the initialization script to create the `spreetail_expenses` database, build the schema, and insert seed data:
   ```bash
   cd backend
   node db/init.js
   ```

### 2. Backend Setup
1. Navigate to the backend directory and install dependencies:
   ```bash
   cd backend
   npm install
   ```
2. Start the Express server:
   ```bash
   npm start
   ```
   *The backend runs on `http://localhost:3000`*

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
