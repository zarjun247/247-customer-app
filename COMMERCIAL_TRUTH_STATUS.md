Status: Partial — refund and payment event append progress

Implemented:
- refund settlement (settleProviderRefundExactlyOnce) now appends refund_completed event within the same DB transaction using appendCommercialEventWithDb. This ensures commercial event is persisted atomically with refund/accounting changes.
- payment capture (confirmPaymentRecord) updated to persist payment_verified event inside a DB transaction using appendCommercialEventWithDb, ensuring payment truth and DB record updates are atomic.

Remaining blockers (high level):
- Extend transactional commercial appends to sale confirmation and purchase commit paths (not yet touched).
- Add DB-backed replay/forensic tests and duplicate webhook concurrency tests.
- Outbox side-effect orchestration & dead-letter handling for downstream side-effects.

Notes:
- This update is narrowly scoped and does not claim full commercial state-machine completion. More verification and concurrency tests planned in follow-ups.
