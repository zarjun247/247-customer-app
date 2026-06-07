# ADR-0010: Emergency stop fail-open posture affirmed for Phase 1 pilot

## Status

Accepted — 2026-05-14 (SM-Ω Phase 1 cleanup).

---

## Context

ADR-0004 documents the emergency stop mechanism: a DB-backed `feature_flags` row toggled by `super_admin`, checked via `readFlag()` in `emergencyStopService.ts` before every customer-facing mutation. ADR-0004 explicitly states that `readFlag()` **fails open** (permits mutations) when the DB is unreachable, citing "avoid cascading failure" as the rationale.

SM-Ω Phase 1 included a task (Task 1.1) to make the middleware fail-closed — blocking all customer mutations if the flag cannot be read. The implementing agent silently skipped the task. A post-merge audit identified this as a conflict between the task spec and the merged ADR that was not escalated.

This ADR resolves that conflict explicitly.

---

## Decision

**Keep the fail-open posture.** Do not modify `server/_core/emergencyStopMiddleware.ts` or `server/services/emergencyStopService.ts`.

The fail-open behavior is correct for the single-store Phase 1 pilot for the following reasons:

### 1. Fail-open does not permit mutations to succeed during a DB outage

Every customer-facing mutation in this codebase writes to MySQL. There is no caching layer, eventual-consistency path, or write-behind queue that would allow a mutation to complete without DB access. If `readFlag()` returns `{ active: false }` because the DB is unreachable, the mutation proceeds to its own DB write — which immediately fails with a connection error.

The outcome of fail-open during a DB outage is identical to fail-closed: no mutations succeed. Fail-closed would only add a redundant 503 response a few milliseconds earlier.

### 2. Fail-closed creates a real availability problem for transient DB issues

A brief DB hiccup (slow query, connection pool saturation, brief network partition) would cause `readFlag()` to fail. Under fail-closed, every customer mutation would return 503 for the duration of the hiccup — even though the DB recovers before the mutation's own write is attempted.

Fail-open limits the blast radius of transient DB issues to the actual failing queries rather than gate-blocking all mutations preemptively.

### 3. The Phase 1 task spec predates ADR-0004

ADR-0004 was written and merged as part of the SM-B / SM-E sprint. The SM-Ω Phase 1 task spec was authored without knowledge of this ADR. Where a task spec conflicts with a merged ADR, the ADR is authoritative. The implementing agent was correct to skip the change; incorrect only in not surfacing the conflict.

---

## Known limitation: cache-expiry window during concurrent DB outage

There is a theoretical scenario worth documenting:

1. Operator activates emergency stop (flag written to DB, cache invalidated, flag now `active=true` in cache)
2. DB goes down within seconds
3. In-process cache expires (TTL: 5 seconds in the current implementation — note: ADR-0004 incorrectly states 30 seconds; the actual value in `emergencyStopService.ts` is `CACHE_TTL_MS = 5_000`)
4. `readFlag()` attempts DB read, DB unreachable → returns `{ active: false }` → fail-open
5. Emergency stop is effectively deactivated

In practice this does not matter for Phase 1 because (a) the DB outage itself prevents mutations from succeeding and (b) a single-store pilot with low traffic means the operator can observe the situation in near real-time.

For Phase 2 (multi-store, replicated DB topology), the preferred solution is a **last-known-state circuit breaker**: if the DB is unreachable, retain the most recent cached flag value rather than defaulting to `false`. This eliminates the cache-expiry window without introducing the fail-closed blast-radius problem. Implementation is deferred to Phase 2.

---

## Consequences

### Positive

- No code change required; existing behavior is already correct for Phase 1.
- No new operational risk introduced.
- The conflict between Task 1.1 and ADR-0004 is now documented and resolved rather than silently deferred.

### Negative

- The cache-expiry window during concurrent DB outage is an accepted known limitation for Phase 1.
- The ADR-0004 cache TTL claim (30 seconds) is stale; actual value is 5 seconds. ADR-0004 is not amended here — the discrepancy is minor and the behavior is correct.

---

## Upgrade path

Revisit this posture when any of the following conditions are met:

- DB is replicated (primary outage no longer means flag reads fail — replica can serve the check)
- Any mutation path is introduced that can succeed without synchronous DB writes (e.g., write-behind queue, Redis cache layer)
- Multi-store deployment where a per-node DB outage might be partial

At that point, implement the last-known-state circuit breaker in `readFlag()` and add an `EMERGENCY_STOP_FAIL_OPEN=true` opt-in env var for operators who prefer the current behavior.
