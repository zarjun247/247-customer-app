-- Migration 0075: widen users.phone to hold PII-encrypted values and add phoneHash for deterministic lookup.
--
-- Context (OPEN_BLOCKERS.md / SM-Ω Phase 1):
--   users.phone was VARCHAR(20) — too small for AES-256-GCM envelope (~67 chars for a 13-char phone).
--   When PII_ENCRYPTION_MASTER_KEY is set, upsertUser/upsertUserByPhone store an encrypted value that
--   would be silently truncated (non-strict MySQL) or rejected (strict mode).
--
--   Additionally, the encrypted phone is non-deterministic (random IV per call), so looking up by the
--   encrypted value is impossible. phone_hash (HMAC-SHA256) gives a stable lookup key.
--
-- After this migration:
--   • phone column can hold encrypted values (VARCHAR(500) ≥ 67 chars for any realistic phone)
--   • phone_hash stores HMAC-SHA256(plaintext_phone, PII_HASH_PEPPER) — NULL when no pepper configured
--   • Unique index on phone_hash enforces no duplicates when hashing is active
--
-- Backfill:
--   Run `node scripts/pii-backfill.mjs` after setting PII_ENCRYPTION_MASTER_KEY + PII_HASH_PEPPER
--   to encrypt existing rows and populate phone_hash.

ALTER TABLE users MODIFY phone VARCHAR(500);
ALTER TABLE users ADD COLUMN phone_hash VARCHAR(64) NULL;
CREATE UNIQUE INDEX uq_users_phone_hash ON users (phone_hash);
