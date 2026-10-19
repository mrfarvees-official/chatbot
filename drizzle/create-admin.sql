-- The preferred admin creation command is:
-- node scripts/create-admin.mjs owner@example.com 'your-password'
--
-- SQL cannot generate the scrypt password hash used by the application.
-- This file documents the SQLite rows created by that Drizzle-compatible seed.
-- Do not insert a plaintext password into password_hash.

-- users.is_admin = 1 marks the local account as an administrator.
-- profiles.user_id stores the owner profile fields.
