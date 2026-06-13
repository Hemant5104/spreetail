# AI Usage Log

**AI Collaborator Used:** Antigravity (powered by Gemini/Claude)

## Key Prompts Used
1. *"make a project reading this file updated assignment and use the csv file for testing and make frontend and backend folder separatly use node for backend and connect the db with pgsql"*
2. *"use react"*
3. *"in groups i cant add members, cant delete a group, expense page isnt working, balance page isnt working, import csv page aint working and settlement also, fix all that issue"*
4. *"the goup i created does not have same members as the csv file so it is not showing correct answers and add the option if the creator of the group want to be part of group or npt"*

## Three Concrete Cases Where AI Got It Wrong & How It Was Fixed

### 1. Database Connection Hardcoding & Security
**The AI's Mistake:** Initially, the AI failed to connect to PostgreSQL because the local machine had a specific, non-default password (`ujjwal51`), but the AI's standard scripts assumed default/no passwords or generic environmental configs. When faced with the error, the AI attempted to bypass authentication entirely by rewriting `pg_hba.conf` to `trust` for all local connections.
**How it was caught:** The connection logs showed `password authentication failed`, and `pg_ctl reload` failed due to lack of administrative privileges.
**The Fix:** I instructed the AI to reset the postgres user password properly via `psql` and then revert the `pg_hba.conf` security policy back to `scram-sha-256`. The AI was then directed to use environment variables (`PGPASSWORD`) and hardcode the known credentials explicitly in the connection pool.

### 2. The Duplicate Insertion Bug During CSV Import
**The AI's Mistake:** When implementing the logic to automatically add missing members to a group during a CSV import, the AI used an `ON CONFLICT (group_id, user_id, joined_at) DO NOTHING` constraint. Because the CSV had expenses spread across multiple dates, the `joined_at` timestamp varied for the same person.
**How it was caught:** After importing the CSV, the Groups UI displayed the exact same user multiple times (e.g., 5 identical "Meera" rows).
**The Fix:** We diagnosed the schema constraint limitation. I directed the AI to write a database cleanup script to delete the duplicated rows using a `GROUP BY` clause. We then refactored the `CSVImporter.js` to fetch the `activeMembers` into a `Set` *before* the import loop started, completely bypassing the database conflict vulnerability.

### 3. Missing Frontend Styling Components
**The AI's Mistake:** When migrating the frontend from vanilla HTML/JS to React, the AI missed copying over the CSS blocks for critical UI elements like Modals, Tabs, and the Auth Logo.
**How it was caught:** Upon compiling the React app, the Modals appeared broken and unstyled at the bottom of the DOM rather than acting as centered overlays.
**The Fix:** I instructed the AI to cross-reference the original `index.css` file, detect the missing `.modal-overlay`, `.modal-content`, and `.tab` classes, and append them correctly to the React project's stylesheet.
