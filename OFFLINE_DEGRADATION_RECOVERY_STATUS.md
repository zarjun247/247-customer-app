# Offline Degradation + Replay-Safe Recovery Status

## Safety scope

This PR adds a backend safety foundation for explicit offline/degraded operation capture and recovery. It is not broad offline POS and is not production-readiness certification for offline selling.

**Safety statement for regulated/pharmacy flows:** This PR allows offline capture of safe intent only; it does not allow offline payment verification, regulated release, stock mutation, or compliance finalization.

## Allowed offline operations

### Draft/intent only

These operations may be queued while offline or degraded only as drafts/placeholders. They remain pending sync until online validation succeeds:

- `customer_order_draft`
- `cart_draft`
- `prescription_upload_metadata_placeholder`
- `support_ticket_draft`
- `supplier_invoice_draft`
- `stock_audit_count_draft`
- `delivery_note_draft`

### Strict idempotency + later reconciliation

These operations may be queued only with an idempotency key and replay validation:

- `non_regulated_otc_sale_draft` — draft only and pending sync; this is not final POS truth.
- `staff_note`
- `cold_chain_manual_temperature_reading`
- `sop_acknowledgement`

## Blocked offline operations

The following are never allowed to finalize offline and fail closed in offline/degraded/recovery replay paths:

- `payment_verification`
- `regulated_h_release`
- `regulated_h1_release`
- `regulated_x_release`
- `prescription_approval`
- `stock_physical_decrement`
- `stock_inward_commit`
- `refund_completion`
- `credit_note_issuance`
- `invoice_finalization`
- `controlled_drug_release`
- `provider_sync_success`
- `h1_final_register_row`

Unknown operation types default to blocked offline until explicitly classified.

## Queue schema/model

The additive table is `offline_operation_queue`. It stores:

- store, terminal, and actor identifiers
- operation type and policy category
- sanitized JSON payload text
- SHA-256 payload hash
- required unique idempotency key
- replay status: `queued`, `replaying`, `applied`, `rejected`, `conflict`, `expired`, `cancelled`
- replay attempts and last replay timestamp
- conflict/rejection reasons
- duplicate idempotency attempt count
- created/updated timestamps

Payload storage is intentionally constrained:

- no prescription image blobs
- no payment secrets/tokens/signatures
- no raw provider secrets
- no direct stock/payment/compliance truth mutation from queue insert

Duplicate idempotency keys return the existing queue record and increment duplicate visibility rather than creating duplicate operations.

## Replay rules

Replay helpers provide:

- `replayOfflineOperation(...)`
- `replayOfflineOperationsForStore(...)`
- `classifyReplayConflict(...)`
- `markOfflineOperationRejected(...)`
- `markOfflineOperationApplied(...)`

Replay behavior:

1. Already-applied/rejected/cancelled records are terminal and are not double-applied.
2. The operation is marked `replaying` and replay attempts are incremented.
3. Current online state must be validated before any apply handler can run.
4. Regulated, compliance, provider-success, payment, stock decrement, inward commit, invoice finalization, refund, and credit-note finalization operations fail closed.
5. Apply handlers are explicit hooks for future safe integrations; the queue itself does not mutate stock, payments, prescriptions, H1 rows, invoices, credit notes, or provider success state.

## Conflict rules

Replay conflict classification currently covers:

- `regulated_or_financial_gate_blocked`
- `stale_stock`
- `stale_price`
- `customer_changed`
- `prescription_changed`
- `provider_unavailable`
- `expired`
- `online_validation_failed`
- `unknown`

Manager review is required for conflicts, stale online state, duplicate idempotency attempts, or operations pending beyond the reporting threshold.

## Integration coverage

Implemented backend integration points:

- Offline/degraded policy service and runtime guard.
- Queue service with sanitization, idempotency, in-memory test repository, and Drizzle repository.
- Replay-safe recovery helpers.
- Recovery report builder with CSV output.
- `/api/health` summary fields for queue counts only.
- Provider-result safety classification so unconfigured/offline providers cannot become success through replay.

No frontend/offline POS UI was added in this PR because safe backend primitives and operational review surfaces should land before wider operator workflows.

## Healthcheck/report behavior

Healthcheck returns only aggregate queue safety metrics:

- queued count
- conflict count
- oldest queued age in milliseconds
- high-risk blocked count

Healthcheck intentionally does not expose payloads, idempotency keys, customer details, prescription metadata, provider secrets, payment data, or other sensitive fields.

Recovery reports return rows, totals, and CSV data for admin/operator review. CSV rows include identifiers, status, age, attempts, duplicate counts, reasons, and payload hash, but not raw payload contents.

## Migration status

Added one migration:

- `drizzle/0045_offline_operation_queue.sql`

The schema is mirrored in `drizzle/schema.ts` with a unique index on `idempotencyKey` and store/status/created indexes. No old migrations were edited.

## Remaining gaps before offline POS

Before any broader offline POS capability, the system still needs:

- explicit operator UX for offline mode entry/exit and recovery workflows
- manager review queues for stale stock/price/customer/prescription conflicts
- DB-backed replay workers with locks/leases for concurrent terminals
- store-level degraded-provider status dashboards and dead-letter review
- end-to-end online apply handlers for only safe draft flows
- legal/compliance sign-off for any OTC draft capture workflow
- extensive integration tests against real stock, reservation, payment, H1, prescription vault, invoice, credit-note, and provider tables

Until those gaps are closed, offline mode remains safe intent capture only.
