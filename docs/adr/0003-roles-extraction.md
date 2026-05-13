# ADR-0003: Extract role definitions to _core/roles.ts

## Status

Accepted — implemented in SM-LM Phase 4, 2026-05.

---

## Context

`server/_core/trpc.ts` exported `UserRole`, `STAFF_ROLES`, `ADMIN_ROLES`, and the `isStaffRole` / `isAdminRole` helpers. `server/_core/rbac.ts` imported those helpers from `trpc.ts`. `trpc.ts` imported `requireStaffStore` from `rbac.ts`.

This created a circular import: `trpc.ts → rbac.ts → trpc.ts`. TypeScript resolves circular imports via lazy binding so it did not fail at compile time, but the cycle was detected by the `scripts/check-circular.mjs` audit added in the same phase.

---

## Decision

Extract `UserRole`, all role-set constants (`STAFF_ROLES`, `ADMIN_ROLES`, `PHARMACIST_ROLES`, `MANAGER_ROLES`, `PURCHASE_ROLES`, `RIDER_ROLES`), and the three boolean helpers (`isStaffRole`, `isAdminRole`, `isCustomerRole`) into `server/_core/roles.ts`.

`trpc.ts` now imports from `roles.ts` and re-exports for backward compatibility. `rbac.ts` and `storageAccess.ts` import directly from `roles.ts`. The dependency graph becomes `trpc.ts → rbac.ts` (one-way).

---

## Consequences

### Positive

- `trpc ↔ rbac` circular import eliminated.
- `roles.ts` is a single source of truth for the 15-value role enum and role sets.
- New code that needs role checks can import from `roles.ts` without pulling in the full tRPC machinery.

### Negative

- A third file now needs to be updated when the role set changes (alongside the DB enum in `drizzle/schema.ts`). Acceptable: role set changes are rare and deliberate.
