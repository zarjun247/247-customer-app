# Incident Runbooks

Five playbooks — one per scenario in `scripts/incident-rehearsal.mjs`. Each playbook specifies the expected alert, severity, and time-boxed response steps.

See also: [OPERATIONS.md](./OPERATIONS.md) §Incident response, [RUNBOOK_ON_CALL.md](./RUNBOOK_ON_CALL.md).

---

## Playbook 1 — Provider Down (`provider_down`)

**Scenario:** Payment provider (Razorpay) returning HTTP 5xx for ≥ 30 seconds.

**Severity:** P1 (P0 if payment settlement is blocked for > 15 minutes)

**Symptoms:**
- Alert: `provider.razorpay.success.rate` SLO event fires `withinBudget=false`
- `/api/admin/runtime/detail` shows Razorpay provider status `unhealthy`
- Dead-letter count for `provider=razorpay` increasing in `/metrics`
- Customers report payment failures; order status stuck in `pending`

---

### First response (within 5 minutes)

1. **Open** `GET /api/admin/runtime/detail` and capture the provider health snapshot (include timestamp in your evidence note — no raw payment IDs or PHI).
2. **Check** Razorpay status page (status.razorpay.com) for active incidents.
3. **Disable** auto-retry for new payment webhooks if the provider is returning invalid responses:
   - Set the provider to degraded mode in the admin UI, or set a pino log filter to trace dead-letter accumulation.
4. **Notify** provider owner and incident commander via the on-call channel.
5. Expected output: `provider_health_slo_emitted` log line with `withinBudget=false`.

---

### Investigation (within 30 minutes)

1. Query dead letters: `GET /api/admin/dead-letters?provider=razorpay&status=pending_review`
   - Expected: list of events with `reviewStatus=pending_review`
2. Inspect failed webhook payloads (no raw signatures or payment secrets in evidence):
   - Capture event count, oldest age, failure reason category.
3. Check worker queue for stuck payment-related jobs: `GET /api/admin/runtime/detail` → worker queue section.
4. Confirm whether the issue is: provider-side outage / signature validation failure / webhook URL misconfiguration.
5. If signature validation fails: verify `RAZORPAY_WEBHOOK_SECRET` has not been rotated without updating the env var.

---

### Mitigation (within 1 hour)

1. If provider-side outage: engage Razorpay support; pause webhook retries; note affected order IDs for manual reconciliation.
2. If webhook secret mismatch: redeploy with correct `RAZORPAY_WEBHOOK_SECRET`. Run:
   ```
   node scripts/validate-deployment-env.mjs --env staging
   pnpm run deploy:check
   ```
3. Do NOT mark payment as captured without provider proof. Enter degraded-mode cash/manual hold if orders must continue.
4. Update affected order status to `payment_hold` with reconciliation note.

---

### Resolution (within 4 hours)

1. Confirm `provider.razorpay.success.rate` SLO event returns `withinBudget=true` for ≥ 15 minutes.
2. Replay safe dead letters (low-impact retries only — NOT double-settlement risk):
   - Run: `GET /api/admin/dead-letters/:id/replay` via admin UI for each confirmed-safe event.
3. Reconcile all orders in `payment_hold` with provider settlement evidence.
4. Write post-mortem using `templates/incident_report.md`.

**Related dashboards:** `/metrics` (provider counters), `/api/admin/runtime/detail` (provider health drilldown)

---

## Playbook 2 — DB Failover (`db_failover`)

**Scenario:** Primary database goes read-only for ≥ 60 seconds.

**Severity:** P0

**Symptoms:**
- `/health/ready` returns HTTP 503 with `db_write_failed` or similar
- Worker job inserts fail; outbox dispatch pauses
- Admin Command Center shows DB connectivity degraded
- Stock-changing operations return 500 errors

---

### First response (within 5 minutes)

1. **Confirm** by running: `curl -s https://<staging-url>/health/ready`
   - Expected output: `{"status":"not_ready","reason":"db_write_failed"}` or similar
2. **Halt** all stock-changing operations: notify pharmacist-in-charge that system is in degraded mode.
3. **Assign** incident commander immediately (P0 stop-the-line).
4. **Check** MySQL/RDS console for primary failover in progress.
5. Do NOT attempt writes during failover — wait for replica promotion.

---

### Investigation (within 30 minutes)

1. Identify whether this is: planned failover / unplanned crash / replication lag / connection pool exhaustion.
2. Check RDS event log (or self-hosted MySQL error log) for failover timestamp.
3. Monitor `/health/ready` every 30 seconds until it returns 200.
4. Capture worker queue state before and after failover:
   - `GET /api/admin/runtime/detail` → worker section
5. Check for split-brain: confirm no writes were accepted by the old primary after failover began.

---

### Mitigation (within 1 hour)

1. After `/health/ready` returns 200: re-enable workers in sequence — reservation expiry → outbox dispatcher → notification worker.
2. Replay any pending `command_outbox` rows that failed during failover:
   - These are idempotent; replay is safe if idempotency keys are not expired.
3. Verify `stockInvariant` is intact: `GET /api/admin/runtime/detail` → stock anomaly count = 0.
4. Verify no duplicate payment events were processed during the failover window.

---

### Resolution (within 4 hours)

1. Confirm zero negative stock rows, zero unowned dead letters.
2. Reconcile any orders that were pending during the outage window.
3. Document failover duration, recovery time, affected order count.
4. Post-mortem: was the failover expected? Was monitoring sufficient? Were recovery steps rehearsed?

**Related dashboards:** `/health/ready`, `/metrics`, RDS/MySQL console

---

## Playbook 3 — Stock Corruption (`stock_corruption`)

**Scenario:** A negative `qtyOnHand` row is detected for a SKU.

**Severity:** P0 (patient safety and stock truth risk)

**Symptoms:**
- `/metrics` → `stock_anomaly_count` > 0
- Admin Command Center shows "Stock Anomalies" badge > 0
- `stockInvariant.assertNoNegativeStock()` throws in health check

---

### First response (within 5 minutes)

1. **Freeze** affected batch immediately via admin UI: Stock → Batches → [affected batch] → Quarantine.
2. **Block** sales for the affected SKU (the `stockInvariant` should already block, but verify).
3. **Notify** pharmacist-in-charge and store manager.
4. Run: `GET /api/admin/runtime/detail` → stock anomaly drilldown (capture affected batch IDs).
5. Do NOT attempt to correct stock without a pharmacist-reviewed count.

---

### Investigation (within 30 minutes)

1. Pull the stock movement log for the affected batch:
   - Query: `SELECT * FROM stock_movements WHERE batch_id = :batchId ORDER BY created_at DESC LIMIT 50`
2. Identify the movement that caused the negative balance:
   - Look for a `sale_fulfil` or `adjustment` movement with a quantity exceeding the available stock.
3. Check whether a race condition occurred: two concurrent reservations for the same batch?
4. Check `stockReservations` for stale/expired reservations that were not released.

---

### Mitigation (within 1 hour)

1. Perform a physical stock count for the affected batch with pharmacist witness.
2. If physical count confirms the stock is genuinely negative:
   - Create an adjustment movement with reason `inventory_count_correction` (requires store manager approval).
3. If the negative balance is due to an un-released reservation:
   - Release the stale reservation via admin UI → Reservations → Release.
4. Un-quarantine the batch only after the pharmacist confirms stock truth.

---

### Resolution (within 4 hours)

1. Verify stock anomaly count returns to 0 in `/metrics`.
2. Review all orders that processed during the anomaly window for double-fulfillment.
3. Update FEFO pick queue if batch sequence was affected.
4. Post-mortem: was this a reservation leak? A concurrency failure? A manual entry error?

**Related dashboards:** Admin Command Center → Stock Anomalies, `/metrics` stock_anomaly_count

---

## Playbook 4 — Payment Reconciliation Mismatch (`payment_reconciliation_mismatch`)

**Scenario:** Razorpay webhook says `paid`, but the order's DB state is still `pending`.

**Severity:** P1

**Symptoms:**
- Provider dead letter appears with `deadLetterClass=payment_state_mismatch`
- `GET /api/admin/dead-letters?provider=razorpay` shows `reviewStatus=pending_review` rows
- Customer reports payment was deducted but order not confirmed

---

### First response (within 5 minutes)

1. **Do NOT** manually mark the order as paid without provider proof.
2. Capture the dead letter ID and the associated `orderId` (do not log raw payment signatures).
3. Check Razorpay dashboard for the payment ID — confirm `status=captured` in Razorpay records.
4. Notify reconciliation owner and finance lead.

---

### Investigation (within 30 minutes)

1. Pull the webhook event log:
   - `SELECT * FROM provider_webhook_events WHERE provider='razorpay' AND order_id=:orderId ORDER BY created_at DESC`
2. Check idempotency key status for the payment capture attempt:
   - `SELECT * FROM idempotency_keys WHERE scope='payment' ORDER BY created_at DESC LIMIT 20`
3. Determine why the payment state wasn't updated:
   - Was the webhook delivered out of order?
   - Did the webhook signature verification fail?
   - Was there a DB write failure during webhook processing?

---

### Mitigation (within 1 hour)

1. If Razorpay shows `status=captured` and our DB shows `pending`:
   - Create a manual reconciliation record noting the mismatch.
   - Via admin UI: replay the dead letter after confirming the provider payment ID and signature are valid.
2. If the webhook signature is invalid: do NOT replay. Investigate whether a forged webhook was sent.
3. Update the order status via a reviewed admin override (requires store manager and reconciliation owner approval).

---

### Resolution (within 4 hours)

1. Confirm provider settlement data matches DB record.
2. Generate a reconciliation report for the affected order.
3. Review: is the idempotency key system preventing duplicate replay? (It should.)
4. Post-mortem: webhook ordering issue? Network timeout? Replay race?

---

## Playbook 5 — OCR Pipeline Stuck (`ocr_pipeline_stuck`)

**Scenario:** An OCR ingestion job is stuck in `processing` state for > 5 minutes.

**Severity:** P1

**Symptoms:**
- Worker dead letter appears with `task=ocr` and `status=dead_letter`
- Dead-letter count for `provider=ocr` increases in `/metrics`
- Prescription upload flow is stalled (pharmacist sees "processing" forever)

---

### First response (within 5 minutes)

1. Confirm the stuck job: `GET /api/admin/runtime/detail` → worker queue → OCR dead letters.
2. Verify the pharmacist knows the prescription is in human-review queue (the AI governance boundary means it is not auto-approved even if OCR is stuck).
3. Notify the OCR provider owner.
4. **Create a human review item** if one hasn't been auto-created:
   - Via admin UI: Prescriptions → [affected prescription] → "Request human review"

---

### Investigation (within 30 minutes)

1. Pull the stuck job from `worker_jobs`:
   - `SELECT * FROM worker_jobs WHERE task='ocr' AND status='dead_letter' ORDER BY updated_at DESC LIMIT 5`
2. Check if the OCR provider endpoint is reachable (provider health drilldown).
3. Check the OCR job payload for a corrupt/unreadable image (file too large? zero bytes?).
4. Determine if this is one prescription or a systematic OCR failure.

---

### Mitigation (within 1 hour)

1. If the OCR provider is down: put OCR jobs in a manual hold queue. Pharmacists review the original uploaded image directly.
2. If the image is corrupt: ask the customer to re-upload a clearer image (via app or helpdesk).
3. If it's a systematic OCR failure: pause the OCR worker queue and switch to manual-entry mode.
4. Pharmacist manually reviews the prescription image and makes the dispensing decision.

---

### Resolution (within 4 hours)

1. Confirm OCR dead-letter count is no longer growing.
2. Replay safe OCR jobs (for already-approved prescriptions — reprocessing for record-keeping only).
3. Backfill any OCR records that were manually entered.
4. Post-mortem: was the OCR provider's SLO breached? Is there a file size or format limit we need to enforce upstream?

**Related dashboards:** Admin Command Center → Dead Letters (OCR), `/metrics` dead_letter_count
