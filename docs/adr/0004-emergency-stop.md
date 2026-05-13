# ADR-0004: Emergency stop via DB-backed feature flag

## Status

Accepted — implemented in SM-B / SM-E, 2026-05.

---

## Context

Pharmacies require a hard stop mechanism: if a critical bug is discovered (wrong drug dispensed, payment system inconsistency, compliance breach), the operator must be able to halt all customer-facing mutations immediately — before a code deploy can be performed.

A static environment variable would require a server restart, which is too slow and introduces downtime risk. A distributed config service adds operational complexity that is not justified at current scale.

---

## Decision

Use a single-row `feature_flags` table (migration 0072) with `flagName = 'emergency_stop'` and a boolean `active` column plus a nullable `reason` text.

`readFlag()` in `server/services/emergencyStopService.ts` queries this row and caches the result for 30 seconds. The `customerMutationProcedure` middleware calls `readFlag()` before every customer-facing mutation and throws `SERVICE_UNAVAILABLE` if the flag is active.

The flag is toggled via the `security.emergencyStop.activate` / `security.emergencyStop.deactivate` tRPC procedures, which are restricted to `super_admin` and write an audit log entry.

A `/health/ready` check polls the flag: a node reports `not_ready` when the emergency stop is active, which causes the load balancer to drain it from the rotation.

---

## Consequences

### Positive

- Operators can halt all customer mutations with one API call, no deployment required.
- `readFlag()` is cached — no per-request DB round-trip on the hot path.
- The stop is observable: health checks change state, load balancers drain, and an audit trail exists.

### Negative

- 30-second cache means mutations can still succeed for up to 30 seconds after activation.
- Does not stop staff-facing mutations (by design — staff need to continue operating to clean up).
- If the DB itself is down, `readFlag()` fails open (permits mutations) to avoid cascading failure.
