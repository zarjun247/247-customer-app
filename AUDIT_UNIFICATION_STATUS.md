# Audit Unification Status (Pass 3A)

## Completed in pass 3A
- `server/routers/inventoryRouter.ts` is now fully inlined to call `logAudit` from `server/services/audit.ts` directly.
- No local inventory router audit helper/proxy remains (`writeAudit`, `writeAuditLog`, `recordAuditEvent`, `createAuditLog`).
- Guard staging now enforces inventory router completion via:
  - `const routersWithNoLocalAuditHelpers = ["server/routers/inventoryRouter.ts"]`

## Guard enforcement status
- `server/audit-unification.guard.test.ts` enforces:
  - no direct `db.insert(auditLogs)` outside approved central files,
  - no `entityId: 0` in production router audit contexts,
  - no local audit helper/proxy wrappers in completed routers list.

## Remaining routers intentionally pending
- `server/routers/prescriptionGovRouter.ts`
- `server/routers/ocrIngestionRouter.ts`
- `server/routers/masterDataRouter.ts`
- `server/routers/masterDataPart3Router.ts`

## Next recommended PR
- `chore/audit-unification-pass-3b-prescription`
