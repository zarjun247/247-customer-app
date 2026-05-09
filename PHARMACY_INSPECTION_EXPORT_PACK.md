# Pharmacy Inspection Export Pack

## Available sections

- Regulated release evidence export.
- H1 register reference export.
- Store license and pharmacist duty export.
- Recall and expired disposal export.
- Manifest with redaction and review metadata.

## How to generate

Use the `server/services/pharmacyLegalOps.ts` inspection functions:

- `generateInspectionExportManifest`
- `generateRegulatedReleaseExport`
- `generateH1ExportReference`
- `generateLicenseAndDutyExport`
- `generateRecallAndDisposalExport`

## Included evidence

Exports include release status, store, pharmacist, duty-session references, drug/schedule/batch/quantity details, license status summaries, duty summaries, recall records, disposal records, and H1 export references where applicable.

## Redactions and minimization

The export layer does not expose document storage keys, prescription image keys, provider secrets, raw payment signatures, or full patient contact fields. Patient references in regulated release export are redacted.

## Known limitations

- The manifest is generated evidence, not regulator acceptance.
- Storage upload is not claimed unless a future storage writer succeeds and records a storage key.
- DB-backed replay must be proven with `TEST_DATABASE_URL` before production release.
- Counsel and pharmacist-in-charge review is required before regulator submission.
