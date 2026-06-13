-- ============================================
-- Seed Data: Flat mates + default group
-- ============================================

-- Default password for all seed users: "password123"
-- bcrypt hash of "password123" with 10 rounds
INSERT INTO users (username, email, password_hash, display_name)
VALUES
  ('aisha', 'aisha@example.com', '$2a$10$exHOHUiiwO9UrnhenaL8uOo4bc7ivqo/r8BicW0jLnbl0dR3JiNFS', 'Aisha'),
  ('rohan', 'rohan@example.com', '$2a$10$exHOHUiiwO9UrnhenaL8uOo4bc7ivqo/r8BicW0jLnbl0dR3JiNFS', 'Rohan'),
  ('priya', 'priya@example.com', '$2a$10$exHOHUiiwO9UrnhenaL8uOo4bc7ivqo/r8BicW0jLnbl0dR3JiNFS', 'Priya'),
  ('meera', 'meera@example.com', '$2a$10$exHOHUiiwO9UrnhenaL8uOo4bc7ivqo/r8BicW0jLnbl0dR3JiNFS', 'Meera'),
  ('dev', 'dev@example.com', '$2a$10$exHOHUiiwO9UrnhenaL8uOo4bc7ivqo/r8BicW0jLnbl0dR3JiNFS', 'Dev'),
  ('sam', 'sam@example.com', '$2a$10$exHOHUiiwO9UrnhenaL8uOo4bc7ivqo/r8BicW0jLnbl0dR3JiNFS', 'Sam'),
  ('kabir', 'kabir@example.com', '$2a$10$exHOHUiiwO9UrnhenaL8uOo4bc7ivqo/r8BicW0jLnbl0dR3JiNFS', 'Kabir')
ON CONFLICT (username) DO NOTHING;

-- Create the flat group
INSERT INTO groups (name, description, created_by)
VALUES ('Flat Expenses', 'Shared expenses for the flat', 1)
ON CONFLICT DO NOTHING;

-- Group memberships with join/leave dates
-- Aisha, Rohan, Priya - original members, still active
INSERT INTO group_members (group_id, user_id, joined_at, left_at, role)
VALUES
  (1, 1, '2026-02-01', NULL, 'admin'),   -- Aisha (admin)
  (1, 2, '2026-02-01', NULL, 'member'),  -- Rohan
  (1, 3, '2026-02-01', NULL, 'member'),  -- Priya
  (1, 4, '2026-02-01', '2026-03-31', 'member'),  -- Meera (left end of March)
  (1, 5, '2026-03-08', '2026-03-14', 'member'),  -- Dev (visiting for trip)
  (1, 6, '2026-04-08', NULL, 'member'),  -- Sam (moved in mid-April)
  (1, 7, '2026-03-11', '2026-03-11', 'guest')    -- Kabir (one-day guest)
ON CONFLICT DO NOTHING;
