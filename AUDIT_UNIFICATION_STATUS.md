# Audit Unification Status (Pass 2)

## Migrated in pass 2
- `server/routers/inventoryRouter.ts`
- `server/routers/prescriptionGovRouter.ts`
- `server/routers/ocrIngestionRouter.ts`
- `server/routers/masterDataRouter.ts`
- `server/routers/masterDataPart3Router.ts`

These routers now route audit persistence through `server/services/audit.ts` (`logAudit`) for audit writes.

## Remaining direct audit inserts
- `server/routers/whatsappRouter.ts` still writes via `writeAuditLog` from `server/db.ts` (not a direct `db.insert(auditLogs)` in router).
- No new direct `db.insert(auditLogs)` was added in pass 2.

## Remaining router-local audit helpers
- Lightweight local helper wrappers still exist in some migrated routers and should be flattened in a follow-up cleanup pass:
  - `server/routers/inventoryRouter.ts`
  - `server/routers/prescriptionGovRouter.ts`
  - `server/routers/ocrIngestionRouter.ts`
  - `server/routers/masterDataRouter.ts`
  - `server/routers/masterDataPart3Router.ts`

## entityId: 0 status
- Pass 2 removed/avoided introducing `entityId: 0` in migrated audit-writing contexts.

## Static guard status
- Global static guard expanded in `server/audit-unification.guard.test.ts` to detect:
  - direct `db.insert(auditLogs)` usage outside approved central files,
  - router-local helper patterns in pass-2 target routers,
  - `entityId: 0` in router code.

## Limitations / deferred
- Action-name normalization is improved but not yet fully taxonomy-complete across all legacy actions.
- Remaining non-pass routers should be moved to `server/services/audit.ts` with direct `logAudit` calls.

## Recommended next PR
- `chore/audit-unification-pass-3`: remove all router-local helper wrappers and migrate WhatsApp + any remaining router audit calls to direct `logAudit`, complete action taxonomy normalization, and keep guard strict.
