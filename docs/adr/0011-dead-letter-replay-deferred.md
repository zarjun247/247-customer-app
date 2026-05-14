# ADR-0011: Dead-letter worker replay formally deferred to Phase 2

## Status

Accepted — 2026-05-14 (SM-Ω Phase 1 cleanup).

---

## Context

`providerDeadLetters` is a triage queue for provider webhook events (payment callbacks, WhatsApp delivery receipts, OCR responses, etc.) that exhausted their automatic retry budget. Events are moved here by `moveProviderEventToDeadLetterOnce` in `providerEventsService.ts` once `attemptCount >= maxAttempts`.

The admin UI exposes a `deadLetter.retry` tRPC mutation that an operator can invoke on a dead-letter row. The procedure is named `retry` and the intent, as written in the original task spec for SM-Ω Phase 1 (Task 1.2), was to have it re-enqueue the original payload for automated re-processing by a background worker.

The implementing agent did not complete this. A post-merge audit found it was silently skipped. This ADR resolves the gap explicitly.

---

## Decision

**Defer worker-based replay to Phase 2.** The `retry` mutation retains its current behavior: it marks the dead-letter row `reviewStatus = 'replayed'`, stamps the reviewing operator, and writes an audit log entry. No automated re-enqueue or handler dispatch occurs.

---

## Why current behavior is acceptable for Phase 1

### Operational sufficiency at pilot scale

For a single-store pilot with low provider event volume, dead-letter events are infrequent. An operator who presses "Retry" in the admin UI can use the `paymentId` or `orderId` on the dead-letter row to locate the affected order and manually re-trigger the relevant action through normal admin flows (reconfirm payment, re-send notification, etc.). This is slower than automated replay but fully auditable and correct.

The `replayed` status is a durable triage record: it distinguishes rows that have been operator-reviewed from `pending_review` rows that have not yet been triaged, and from `resolved` rows that were written off with explanation. This signal is useful even without automated re-execution.

The volume threshold at which manual remediation becomes untenable is not yet determined — it depends on pilot observation data. This threshold will be established during the Phase 1 pilot and used to schedule the Phase 2 upgrade.

### Infrastructure prerequisites are not yet met

Three conditions must be satisfied before automated worker replay is safe:

**1. Outbox dispatcher must be running at boot.**
`startOutboxDispatcher()` is explicitly documented in OPEN_BLOCKERS.md as not called at boot. `providerWebhookEvents.nextRetryAt` is populated by `scheduleProviderEventRetry`, but no worker polls that column and dispatches to the handler. Resetting a dead-letter event's `processingStatus` back to `retry_scheduled` today would set a flag that nothing reads.

**2. A handler registry is required for generic dispatch.**
Dead-letter rows span multiple providers and event types (Razorpay payment webhooks, WhatsApp status callbacks, OCR results, etc.). Each provider has a different handler code path. Automated replay requires a `dispatch(provider, eventType, payloadJson)` abstraction that routes the event to the correct handler. This does not exist today.

**3. Status-reset idempotency must be proven.**
`providerWebhookEvents.processingStatus = 'dead_letter'` is treated as terminal by `scheduleProviderEventRetry` (it returns early without scheduling). Replay requires atomically resetting both the `providerWebhookEvents` row and the `providerDeadLetters` row, then ensuring the event is not deduplicated via `rawPayloadHash` on re-execution. The idempotency semantics of this reset path are not yet designed.

### The `rawPayload` gap

`providerDeadLetters` stores `rawPayloadHash` (a 64-char SHA-256 hash for deduplication) but not the raw payload bytes. The actual payload lives in `providerWebhookEvents.payloadJson`. The task spec referenced "worker reading `rawPayload`" — that column does not exist in the schema. Implementing replay correctly requires reading from `providerWebhookEvents` via the `providerEventId` foreign key, which is straightforward, but is a design detail that should be explicitly addressed in the Phase 2 implementation ADR.

---

## Known UX gap: misleading procedure name

The tRPC procedure is named `retry` and the admin UI button label implies the system will automatically retry the operation. It will not. The operator is recording a triage decision; manual follow-up is required.

The correct long-term name is `markForFollowup` (or similar). The rename is deferred to Phase 2 because it is an API-level change that affects client callers not in this repository. Until the rename, the procedure carries an explanatory comment block (see `server/routers/deadLetterRouter.ts`).

---

## Upgrade path

Implement automated worker replay when all of the following are in place:

1. `startOutboxDispatcher()` wired at boot and running in staging with observed reliability
2. A provider handler registry exists that supports `dispatch(provider, eventType, payloadJson)` with idempotency guarantees
3. `providerWebhookEvents` status-reset logic is designed and tested (reset from `dead_letter` → `retry_scheduled` atomically, clearing the dead-letter row or marking it superseded)
4. Dead-letter volume during Phase 1 pilot has been observed and a threshold set for when manual remediation is no longer viable

At that point:
- Update the `retry` mutation to enqueue a replay job rather than just setting status
- Rename `retry` → `markForFollowup` (or `replayEvent`) and update the client
- Supersede this ADR with an implementation ADR documenting the chosen dispatch model
- Add tests: replay re-runs the handler, second replay is a no-op at business level, audit row exists

---

## Consequences

### Positive

- No engineering time spent on infrastructure that depends on unmet prerequisites.
- The gap is documented and traceable rather than silently deferred.
- Current `replayed` status is still a useful operator triage signal.

### Negative

- Operators must manually remediate dead-letter events using the `paymentId`/`orderId` context on the row.
- The `retry` procedure name is misleading; this is accepted as a known limitation until the Phase 2 rename.
- If dead-letter volume grows unexpectedly during Phase 1, this deferral must be revisited ahead of schedule.
