-- Runs only on first database initialisation (empty postgres_data volume).
-- A dedicated database used as the demo "warehouse" destination so synced
-- data lands somewhere separate from the platform's own tables.
CREATE DATABASE warehouse;
