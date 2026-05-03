# Audit Unification Status (Pass 1)

## Centralized in this PR
- Added `server/services/audit.ts` central `logAudit` helper.
- Migrated core audit writes in:
  - `server/routers/salesRouter.ts`
  - `server/routers/purchaseRouter.ts`

## Audit schema used
- Existing Drizzle table: `audit_logs` (`auditLogs` in `drizzle/schema.ts`).
- No new audit table.
- No migration added.

## Fields supported by central service
- action, entityType, entityId
- actorType, actorId, actorRole
- source/channel
- beforeJson, afterJson
- reason, metadata (payload)
- ipAddress, userAgent, sessionId

## Remaining direct/local audit writes (deferred)
- `server/routers/inventoryRouter.ts` (local `writeAudit` helper)
- `server/routers/prescriptionGovRouter.ts` (local `writeAuditLog` helper)
- `server/routers/ocrIngestionRouter.ts` (local `writeAuditLog` helper)
- plus non-core router direct/local writes identified by guard/search

## Limitations
- This pass prioritizes core sale/purchase paths first.
- Additional routers still require migration in pass 2.

## Recommended next PR
- `chore/audit-unification-pass-2`: migrate inventory + prescriptionGov + OCR + remaining router-local helpers to `server/services/audit.ts`, and tighten guard to allow only central service.
