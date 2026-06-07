# ADR-0002: executeCommand as the command bus for state-mutating operations

## Status

Accepted — implemented in SM-LM Phase 1 / Phase 2, 2026-05.

---

## Context

The codebase started with direct Drizzle `db.insert` / `db.update` calls inside tRPC mutation handlers. This made it impossible to:

- Detect and safely replay duplicate requests (payment double-posts, network retries)
- Log a durable audit of every state-mutating operation with its input hash
- Queue side-effects (emails, webhook acks, label prints) transactionally with the mutating write

Payment and sale mutations in particular required idempotency guarantees from the start because Razorpay retries webhooks and mobile clients retry on network error.

---

## Decision

Introduce `server/services/executeCommand.ts` as a mandatory gateway for all critical state-mutating operations. It provides:

1. **Idempotency check** — looks up `command_log` by `(idempotencyKey, commandName)`; replays prior output if state is `completed`, blocks if `in_flight`, refuses if `failed` (requires new key to retry).
2. **Input hash** — `SHA-256(canonicalize(input))` stored on the command log row detects replayed requests with mutated inputs.
3. **Transactional outbox** — side-effect rows written to `command_outbox` inside the same transaction as the handler's mutations; guarantees at-least-once delivery when the dispatcher is running.
4. **State machine** — `in_flight → completed | failed`; enforced by `commandStateMachine.ts` assertions.
5. **SLO emission** — optional `sloName` triggers a `slo_events` row on success/failure.

Three procedures were migrated in Phase 1/2: `sale.confirm`, `purchase.commitInvoice`, `payment.verifyPayment`. Remaining 97 procedures continue to use direct writes (documented in OPEN_BLOCKERS.md as Phase 4.2 deferred).

---

## Consequences

### Positive

- Duplicate payment/sale confirmations are safely idempotent — no double charges.
- Every command carries a traceable `commandId`, `actorUserId`, `storeId`, `inputHash`, and `durationMs`.
- Side-effects cannot silently diverge from the mutation that triggered them.

### Negative

- Two extra DB round-trips per command (idempotency check + state update). Acceptable at current load.
- The outbox dispatcher is not yet started at boot (documented in OPEN_BLOCKERS.md). Side-effects are stored but not dispatched until wired.
- Gradual migration means inconsistent semantics: 3 procedures use the pattern, 97 do not.
