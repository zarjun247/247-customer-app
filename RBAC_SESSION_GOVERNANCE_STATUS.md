# RBAC Session Governance Status

## Role Matrix

Canonical runtime roles are `customer`, `rider`, `staff`, `pharmacist`, `store_manager`, `ops_manager`, `finance`, `admin`, `super_admin`, and `system`. Existing persisted roles are normalized without changing historical data: `user` maps to `customer`; `delivery_operator` maps to `rider`; `cashier`, `salesman`, `inventory_operator`, and `auditor` map to `staff`; `purchase_manager` maps to `store_manager`; `ops_admin` maps to `ops_manager`; and `accountant` maps to `finance`.

## Permission Matrix

The central matrix is implemented in `server/services/rbacPolicy.ts`.

| Permission | Primary roles |
| --- | --- |
| `admin.dashboard.view` | store manager, ops manager, finance, admin, super admin, system |
| `pharmacy.os.access` | staff, pharmacist, store manager, ops manager, admin, super admin, system |
| `pos.sale.create`, `pos.sale.confirm` | staff and above pharmacy roles |
| `prescription.view`, `prescription.review` | pharmacist, store manager, ops manager, admin, super admin, system |
| `regulated.release.approve`, `h1.register.create` | pharmacist, store manager, ops manager, admin, super admin, system |
| `inventory.view` | staff and above pharmacy roles |
| `inventory.adjust`, `purchase.create`, `purchase.commit` | store manager, ops manager, admin, super admin, system |
| `refund.initiate`, `refund.approve`, `credit_note.issue` | store manager, ops manager, finance, admin, super admin, system |
| `supplier.payment.create`, `accounting.export` | ops manager, finance, admin, super admin, system |
| `reports.view` | store manager, ops manager, finance, admin, super admin, system |
| `staff.session.revoke` | store manager, ops manager, super admin, system |
| `settings.manage` | admin, super admin, system |
| `provider.health.view`, `audit.view` | ops manager, admin, super admin, system |

## Protected Sensitive Actions

`assertSensitiveActionAllowed` now provides a fail-closed server helper for prescription vault access, prescription review, regulated release approval, H1 register creation, refund initiation/approval, credit note issue, inventory adjustment approval, purchase commit, supplier payment creation, accounting export, staff session revoke, provider health details, and audit export.

## Session Freshness Rules

Sensitive actions require an active staff session and a recent `lastSeenAt`. Default freshness is 15 minutes. Higher-risk approvals and finance/admin actions use 5–10 minute windows. Revoked, expired, suspicious, or re-auth-required sessions are denied.

## Route Coverage Completed

- Prescription governance queue and single-prescription retrieval now require `prescription.view` and fresh staff-session vault access.
- Prescription metadata and line editing now require `prescription.review` and fresh staff-session review access.
- Prescription line approval now requires `regulated.release.approve` and a fresh staff session.
- Frontend `/admin/*` routes continue to be generated through `RestrictedRoute` with admin roles.
- Frontend `/pharmacy-os` remains wrapped with `RestrictedRoute` and staff roles.

## Route Coverage Deferred

Static tests document the high-risk scanner shape, but not every legacy router is fully migrated to the new central helper in this PR. Remaining follow-up candidates include deeper purchase commit, refund approval, stock adjustment, provider health, and accounting export procedure-by-procedure wiring where existing business logic should not be redesigned.

## Migration Status

One additive migration was added: `drizzle/0048_rbac_staff_session_governance.sql`. It adds nullable/backward-compatible privileged session governance fields and a staff/session/status lookup index. Existing migrations were not edited.

## Frontend and Server Guard Notes

Frontend guards are defense-in-depth only. Sensitive action authorization is enforced by server-side helpers in `server/services/rbacPolicy.ts`, and frontend route guards are not treated as a substitute for server-side authorization.

## Remaining Risks Before Production

- The central policy should be progressively wired into every high-risk mutation after owner review of each domain-specific route.
- Production rollout should verify all active staff clients send `x-staff-session-id` or an equivalent server session identifier.
- Optional SOP acknowledgement enforcement is available but should be versioned per SOP before global rollout.
