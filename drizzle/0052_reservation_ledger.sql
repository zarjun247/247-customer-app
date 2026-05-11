-- Migration 0052: reservations + reservation_lines (MP6 reservation ledger)
-- IDs: reservations/reservation_lines use VARCHAR(36) UUIDs (matching command_log pattern).
-- FKs to existing int-ID tables (stores, users, batch_ledger, products) use INT.
-- FK to sales.id uses VARCHAR(36) (sales uses UUID PK).

CREATE TABLE reservations (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  store_id INT NOT NULL,
  customer_id INT NULL,
  cart_id INT NULL,
  sale_id VARCHAR(36) NULL,
  state VARCHAR(32) NOT NULL,
  ttl_seconds INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  confirmed_at TIMESTAMP NULL,
  released_at TIMESTAMP NULL,
  expired_at TIMESTAMP NULL,
  command_log_id VARCHAR(36) NULL,
  idempotency_key VARCHAR(128) NULL,
  CONSTRAINT fk_reservations_command FOREIGN KEY (command_log_id) REFERENCES command_log(id)
);

CREATE INDEX idx_reservations_state_expires ON reservations (state, expires_at);
CREATE INDEX idx_reservations_store_state ON reservations (store_id, state);
CREATE INDEX idx_reservations_customer_state ON reservations (customer_id, state);
CREATE INDEX idx_reservations_cart ON reservations (cart_id);
CREATE INDEX idx_reservations_sale ON reservations (sale_id);
CREATE INDEX idx_reservations_idempotency ON reservations (idempotency_key);

CREATE TABLE reservation_lines (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  reservation_id VARCHAR(36) NOT NULL,
  product_id INT NOT NULL,
  batch_id INT NOT NULL,
  variant_id INT NULL,
  quantity INT NOT NULL,
  expiry_date DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reservation_lines_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id)
);

CREATE INDEX idx_reservation_lines_product_batch ON reservation_lines (product_id, batch_id);
CREATE INDEX idx_reservation_lines_reservation ON reservation_lines (reservation_id);
CREATE INDEX idx_reservation_lines_batch ON reservation_lines (batch_id);
