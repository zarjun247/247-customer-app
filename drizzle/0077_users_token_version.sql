-- Migration 0077: Add tokenVersion to users for session revocation
-- tokenVersion is incremented on logout, password reset, and user suspension.
-- The JWT must carry the tokenVersion at signing time; on verification the
-- stored version is compared and the token is rejected if they differ.
ALTER TABLE `users`
  ADD COLUMN `tokenVersion` int NOT NULL DEFAULT 1
    COMMENT 'Incremented on logout/password-reset/suspension to invalidate all prior tokens';
