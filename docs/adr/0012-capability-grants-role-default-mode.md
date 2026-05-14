# ADR-0012: capability_grants role-default mode as Phase 1 posture

## Status

Accepted — 2026-05-14 (SM-Ω Phase 1 cleanup).

---

## Context

Migration 0056 (`drizzle/0056_capability_grants.sql`) created two tables:

- `capability_definitions` — a registry of named capabilities, each with a description and risk level (seeded with 12 entries)
- `capability_grants` — per-user explicit grant rows, with expiry and revocation support

At first boot after migration, `capability_definitions` is populated by the seed INSERT statements in the migration itself, but `capability_grants` is empty. Early status documents flagged this as a potential blocker: _"capability_grants empty at first boot — system may deny all capability-gated actions."_

SM-Ω Phase 1 closed this entry in OPEN_BLOCKERS.md as "by design" without writing an ADR. This ADR provides the missing documentation.

---

## Decision

**The system is fully operational with zero rows in `capability_grants`.** No seed data, migration step, or bootstrap script is needed for the `capability_grants` table.

This is achieved via the `CAPABILITY_ROLE_DEFAULTS` map in `server/services/capabilityGrantService.ts` (a sealed file) and the lookup order in `hasCapability`.

---

## How it works

### CAPABILITY_ROLE_DEFAULTS

A compile-time `Record<string, readonly string[]>` in `capabilityGrantService.ts` maps every named capability to the roles that implicitly hold it:

| Capability | Roles |
|---|---|
| `inventory.adjust` | admin, super_admin, ops_admin, store_manager |
| `refund.large` | admin, super_admin, ops_admin |
| `audit.view` | admin, super_admin, ops_admin, auditor |
| `audit.export` | admin, super_admin, ops_admin |
| `rbac.grant` | super_admin |
| `rbac.revoke` | super_admin |
| `chaos.trigger` | super_admin, ops_admin |
| `pii.decrypt-bulk` | super_admin |
| `user.create` | admin, super_admin, ops_admin |
| `user.delete` | super_admin |
| `store.create` | super_admin |
| `store.close` | super_admin |

### hasCapability lookup order

`hasCapability(userId, capabilityName, now, userRole)` in `capabilityGrantService.ts`:

1. **Role default fast path** — if `userRole` is in `CAPABILITY_ROLE_DEFAULTS[capabilityName]`, return `true` immediately. No DB query.
2. **Explicit grant check** — query `capability_grants` for an active, non-expired, non-revoked row matching `(userId, capabilityName)`.
3. **Deny** — if neither path returns true.

Role defaults always take precedence in the sense that they short-circuit the DB check. An explicit grant in `capability_grants` can only extend access beyond role defaults (granting a capability to a user whose role is not in the default set) — it cannot be used to *narrow* access for a user who already qualifies via their role.

### capabilityProcedure

`capabilityProcedure(capabilityName)` in `server/_core/trpc.ts` is the tRPC middleware that enforces a capability on a procedure. It calls `hasCapability` with the authenticated user's ID and role. If the check fails, it throws `FORBIDDEN`.

Current production usages:

| Router | Procedure | Capability |
|---|---|---|
| `inventoryRouter` | `approve`, `reject` | `inventory.adjust` |
| `deadLetterRouter` | `escalate` | `chaos.trigger` |
| `chaosRouter` | `recordDrill` | `chaos.trigger` |
| `onCallRouter` | `upsert` | `chaos.trigger` |
| `commandLogRouter` | `stats` | `audit.view` |
| `helpdeskRouter` | `resolve` | `audit.view` |

All six usages are covered by role defaults. A newly provisioned system with no rows in `capability_grants` immediately gates these procedures correctly based on the authenticated user's role.

---

## What explicit grants are for

`security.grantCapability` (a `superAdminProcedure` in `securityRouter.ts`) allows a `super_admin` to issue an explicit per-user grant. This is intended for:

- **Capability elevation beyond role defaults** — e.g., giving a specific `store_manager` temporary access to `refund.large`, which their role does not cover by default
- **Time-bounded access** — grants support an `expiresAt` timestamp, enabling short-lived elevated access that automatically expires
- **Named individual accountability** — in regulated contexts, an auditor may require that high-risk actions (e.g., `pii.decrypt-bulk`) be individually authorised per-user rather than granted by role, even if `super_admin` is already in the role default

The `capability_grants` table and its revocation machinery exist for these override scenarios. They are not required for day-to-day operation during the Phase 1 pilot.

---

## Why this is acceptable for Phase 1

The 12-capability matrix covers all current protected procedures. The role taxonomy (`super_admin`, `admin`, `ops_admin`, `store_manager`, `auditor`) maps cleanly to the organizational structure of a single-store pilot. No user has been identified who needs a capability their role does not cover.

Role defaults are compiled into the service binary, so they are auditable via code review and cannot be altered at runtime without a deployment. This provides a stronger audit trail than a DB-only grant system where rows can be inserted and deleted without a code review.

---

## Upgrade path

Explicit DB grants become the primary access mechanism (rather than a supplementary override layer) when any of the following conditions are met:

- **Multi-store deployment with store-scoped capability overrides** — e.g., a pharmacist at store A is granted `inventory.adjust` for that store only; role defaults are store-agnostic and cannot express this
- **Regulated per-user accountability required** — a compliance or legal requirement specifying that each high-risk action must be individually authorized, not inferred from role
- **Capability tightening (RBAC Phase 2)** — roles are narrowed so that fewer capabilities are in defaults, and explicit grants fill the gap for users who need elevated access

At that point:
- Evaluate whether `CAPABILITY_ROLE_DEFAULTS` should remain as a fallback or be removed
- Add store-scoping to `capability_grants` if multi-store overrides are required (new column `storeId`, nullable for global grants)
- Consider a seeding script or admin UI flow to initialize grants for existing staff at store onboarding
- Supersede this ADR with an updated RBAC design ADR

---

## Consequences

### Positive

- Zero operational burden at first boot: no manual grant seeding required.
- Role-based access is auditable at code level, not just DB level.
- The role default fast path avoids a DB round-trip on every capability check for standard staff actions.

### Negative

- Role defaults are in a sealed file; adding or changing a default requires a code deploy and review, not a DB update. This is intentional for Phase 1 but may be inflexible at scale.
- There is no runtime mechanism to deny a capability to a specific user who holds it via their role (revocation only works against explicit grants). Role downgrades require reassigning the user's role.
