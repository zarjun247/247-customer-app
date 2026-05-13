# ADR-0009: File-size splitting via barrel re-export pattern

## Status

Accepted (legacy pattern) — documented and partially refactored in SM-LM Phase 4, 2026-05.

---

## Context

Several core modules grew beyond 600 lines: `db.ts` (762 lines), `connectors.ts`, `pharmacy.ts`, `routingEngine.ts`, and many routers. The root cause is that each module is a domain aggregate that contains many related functions that cannot easily be split into independent modules without circular imports (every query function needs the `getDb` helper from `db.ts`; every connector needs the shared result type from `connectors.ts`).

A hard split into independent modules would require either:
- Duplicating shared utilities across modules (violates DRY), or
- Introducing a new layer of shared helper modules (adds complexity for unclear benefit at current team size).

---

## Decision

Use a **barrel re-export** pattern: keep the shared utilities in the primary module (`db.ts`, `connectors.ts`, etc.) and move the overflow functions into a domain-named sibling file that imports the shared utilities and whose exports are re-exported via `export * from "./db-extended"` at the end of the primary file.

The sibling files were renamed from the opaque `*Part2` convention to domain-meaningful names (SM-LM Phase 4):

- `server/db-extended.ts` — analytics queries, invoice snapshots, refill reminder queries
- `server/connectors-peripheral.ts` — label printer and ERP connectors
- `server/pharmacy-metrics.ts` — pharmacy staff and batch metric queries
- `server/routing-engine-extended.ts` — multi-node routing, ETAs, node health checks

A `max-lines: warn (600)` ESLint rule tracks compliance. New code should not add to existing large files without splitting first. The lint rule is advisory (pre-commit gate exempts it); 31 existing files exceed the threshold.

---

## Consequences

### Positive

- Files remain navigable — related functions are grouped together without forcing a developer to hunt across 5 modules.
- No new public API surface: consumers import from `db.ts` and get everything via the barrel re-export.

### Negative

- Circular imports: the sibling file imports utilities from the primary file; the primary file barrel-re-exports the sibling. `scripts/check-circular.mjs` reports these as 4 cycles. They are intentional and documented. Eliminating them would require extracting shared utilities into a third module (deferred to post-launch cleanup).
- The pattern does not scale past two splits: if `db-extended.ts` also exceeds 600 lines, a third file (`db-extended-2.ts`) would make the pattern hard to follow. The long-term solution is domain module separation with a shared `db/helpers.ts`.
