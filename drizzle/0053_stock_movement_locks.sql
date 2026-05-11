-- Migration 0053: stock_lock_keys table for advisory locking (MP6)
-- One row per held lock; rows with past expires_at are stale and can be claimed.
-- lock_key format: "stock:{storeId}:{productId}" or "stock:{storeId}:{productId}:{variantId}"

CREATE TABLE stock_lock_keys (
  lock_key VARCHAR(128) NOT NULL PRIMARY KEY,
  acquired_by VARCHAR(36) NOT NULL,
  acquired_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_stock_lock_keys_expires ON stock_lock_keys (expires_at);
