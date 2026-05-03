# STORE ISOLATION + CENTRAL RBAC STATUS

## Routers inspected
inventoryRouter, purchaseRouter, salesRouter, reportsRouter, prescriptionGovRouter, deliveryRouter, whatsappRouter, commandCenterRouter, customerMedicineRouter, masterDataRouter, masterDataPart3Router, ocrIngestionRouter, paymentRouter, helpdeskRouter, consentRouter.

## Helper functions added
- `server/_core/rbac.ts`: `isSuperAdmin`, `isAdmin`, `isStaff`, `getUserStoreId`, `requireStaffStore`, `requireStoreAccess`, `requireSameStoreOrSuperAdmin`, `requireCustomerOwnsResource`, `requireOrderAccess`, `requirePrescriptionAccess`, `assertCanReadStoreResource`, `assertCanMutateStoreResource`, `assertCanCrossStore`.

## Procedure helpers added
- `storeStaffProcedure`, `storeManagerProcedure`, `storePharmacistProcedure`, `storePurchaseProcedure`, `storeRiderProcedure`, `superAdminProcedure` in `server/_core/trpc.ts`.

## Routes hardened in this PR
- Added centralized `requireStoreAccess` checks on high-risk flows where `input.storeId` is available in inventory/purchase/sales and additional high-risk routers.
- Staff routes fail closed where `staffStoreId` is missing via `requireStaffStore` helper and store-scoped procedure helpers.

## Policies
- super_admin cross-store: allowed only explicit helper path.
- admin/ops_admin cross-store: denied by default in store helper unless explicitly allowed by option.
- staff missing store: fail closed with forbidden.
- customer ownership: helper implemented; rollout to all customer endpoints remains pending.

## Public route exceptions
- Expected public routes (OTP, webhook, health) require per-route verification hardening and remain allowlisted by purpose.

## Tests/guards added
- `server/rbac-store-scope.guard.test.ts`
- `server/store-isolation.guard.test.ts`

## Gaps deferred
- Full per-procedure rollout across all routers.
- Runtime/integration cross-store denial coverage for every route.
- Fine-grained customer dependent/family authorization model.

## Validation results
See PR validation section.

## Next recommended prompt
`feat/idempotency-reservation-truth`


## Correction update (import-only guard fix)
- Removed unsafe default-store behavior by replacing delivery store resolver fallback with fail-closed `requireStaffStore` path.
- Added real `requireStoreAccess(...)` enforcement in delivery task/entity flows and rider mutation/listing paths.
- Added store-access checks in prescription governance queue/get/update/upsert-line paths where entity/input store IDs are available.
- Added reports scoping behavior for staff without explicit storeId using assigned store (`requireStaffStore`) and explicit cross-store checks on provided storeId.
- Confirmed no `user.storeId ?? 1`/`staffStoreId ?? 1` fallback remains in touched production routers.
- Deferred: remaining prescription and delivery procedures that require deeper entity-join store derivation are pending explicit rollout.
- Phase remains partial.
