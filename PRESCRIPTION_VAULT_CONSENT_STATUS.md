# Prescription Vault Consent Status

## Scope
P20-05 strengthens prescription vault metadata, explicit consent/on-file governance, access auditing, and validity checks without adding diagnosis or prescribing automation.

## Schema fields added/confirmed
- Confirmed existing prescription metadata: `doctorName`, legacy `doctorReg`, legacy `prescribedDate`, legacy `expiryDate`, `patientName`, and `linkedProductIds`.
- Added nullable/canonical prescription metadata: `doctorRegNo`, `clinicName`, `prescriptionDate`, `validUntil`, and `source` (`upload`, `whatsapp`, `doctor`, `pharmacist`, `manual`).
- Added nullable consent/on-file governance: `consentGivenAt`, `consentSource`, `consentRevokedAt`, `onFileMarkedBy`, and `onFileMarkedAt`.
- Added access-audit detail to `prescription_access_log`: `actorId`, `actorRole`, `channel`, and `accessedAt`, while preserving legacy `accessedBy`, `accessType`, `purpose`, and `createdAt`.

## Consent/on-file behavior
- Customer `markOnFile` now requires `consentGiven: true` and a `consentSource`; the customer UI sends this only after the user checks an explicit consent box.
- `markOnFile` still requires the prescription to belong to the signed-in customer and have status `approved` before it can become `on_file`.
- Marking on file records consent timestamp/source plus the actor and timestamp that marked the prescription on file.
- Consent revocation is modeled with `consentRevokedAt`; revoked prescriptions remain readable but are not treated as active usable on-file prescriptions.
- Legacy on-file rows are backfilled as manually governed (`consentSource = manual`, `onFileMarkedAt` from existing timestamps) without fabricating `consentGivenAt`.

## Vault access audit behavior
- Customer detail and vault-list access call `logPrescriptionVaultAccess`.
- Pharmacist/staff review access and counter-billing API checks call the same vault access logger.
- Each vault access records actor id, actor role, prescription id, purpose, channel, and timestamp in `prescription_access_log`, and mirrors safe context to `audit_logs`.
- Customer detail access still returns `NOT_FOUND` when a prescription does not belong to the signed-in customer, avoiding cross-customer disclosure.

## Expiration/validity behavior
- Added helpers: `isPrescriptionExpired`, `canUsePrescriptionOnFile`, and `assertPrescriptionUsableForCustomer`.
- Helpers check ownership, on-file status, expiry (`validUntil` with legacy `expiryDate` fallback), consent revocation, and repeat-dispense limits.
- Governance gate checks reject expired prescriptions and revoked on-file consent.
- Approved prescriptions remain readable; only active on-file usability is blocked by revocation/expiration.

## Migration/backfill notes
- Migration added: `drizzle/0034_prescription_vault_consent.sql`.
- Metadata aliases are backfilled from legacy columns (`doctorReg`, `prescribedDate`, `expiryDate`) where present.
- Existing `on_file` rows are marked as manually governed for traceability; no fake consent timestamp is created.
- Existing access-log rows backfill `actorId` from `accessedBy` and `accessedAt` from `createdAt`.

## Validation results
- `pnpm install` completed successfully; pnpm reported ignored dependency build scripts for `@tailwindcss/oxide` and `esbuild`.
- `pnpm run check` passed.
- `pnpm test -- --runInBand` passed: 55 test files, 212 tests.
- `pnpm run build` passed; Vite reported existing environment-placeholder and large chunk warnings.

## Files changed
- `drizzle/schema.ts`
- `drizzle/0034_prescription_vault_consent.sql`
- `server/services/prescriptionVault.ts`
- `server/db.ts`
- `server/routers.ts`
- `server/routers/prescriptionGovRouter.ts`
- `server/prescription-vault-consent.guard.test.ts`
- `client/src/pages/RxUpload.tsx`
- `PRESCRIPTION_VAULT_CONSENT_STATUS.md`

## Remaining risks
- P0: None known in this branch.
- P1: Existing legacy on-file prescriptions may need an operational consent-refresh campaign if business policy requires modern explicit consent for every legacy record.
- P2: Product-level linking remains JSON text and may later benefit from a normalized prescription-product join table.
