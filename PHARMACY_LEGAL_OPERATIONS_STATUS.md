# Pharmacy Legal Operations Status

## Regulated release evidence model

This pack adds `regulated_release_events` as an additive, nullable evidence table for regulated release proof. It stores string-safe order, sale, sale-line, product, batch, prescription, H1, customer, store, and pharmacist references, the schedule flag, pharmacist decision, checklist JSON, missing-evidence JSON, evidence hash, notes, and creation timestamp.

`server/services/regulatedReleaseProof.ts` builds a pharmacist-controlled checklist covering prescription presence, expiry/revocation, doctor details, patient identity, schedule/classification, H1 evidence where applicable, pharmacist actor capture, string-safe product/batch refs, timestamped decision evidence, and rejection/clarification reasons.

## Recall workflow

`server/services/recallManagement.ts` creates recall notices, finds affected inventory and affected sales/customers by product and batch, generates recall action plans, records customer notification status, and closes recalls. The service intentionally does **not** mutate stock directly. When quarantine is requested without an approved gateway, it returns a task to route quarantine through `stockInvariant` or another approved inventory service.

## Cold-chain workflow

`server/services/coldChainMonitoring.ts` supports manual/import/device-shaped temperature readings without claiming live IoT integration. It evaluates low/high excursions from configured min/max Celsius bounds, creates open alerts only for excursions, lists alerts, records corrective actions, and marks alerts resolved.

## SOP acknowledgement model

`server/services/sopAcknowledgement.ts` defines SOP acknowledgement types for prescription review, H1 register, cold chain, recall, stock quarantine, expiry disposal, refund/cancellation, and privacy prescription access. It can record acknowledgements, calculate staff status, list expired acknowledgements, and provide a helper-only action requirement result. It does not block runtime flows by default.

## Inspector report scope

`server/services/pharmacyLegalOpsReport.ts` builds inspector-ready rows, totals, and CSV data across regulated release evidence, H1 incompleteness, cold-chain alerts, recall notices, and SOP overdue status. Report output redacts sensitive prescription and customer data and never includes raw prescription blobs, image URLs, tokens, or secrets.

## Migration added

Added one additive migration: `drizzle/0045_pharmacy_legal_operations.sql`. The migration creates `regulated_release_events` and indexes sale, order, prescription, product, pharmacist, and created-at paths for inspector and legal-operations queries. `drizzle/schema.ts` mirrors the new table.

## Runtime integration coverage

The new services are additive foundations. They write audit events through the existing audit service when invoked. They do not change sale confirmation, payment lifecycle, stock mutation, OCR inwarding, supplier ledger, accounting, refunds, or credit notes.

## Remaining before legal production certification

- Route recall quarantine through the approved inventory/stock-invariant gateway and test the end-to-end operational path.
- Wire regulated release proof creation at the exact pharmacist approval point once product, prescription, and H1 context are available.
- Add persistence-backed dashboards and inspector exports using production database filters.
- Complete jurisdiction-specific SOP content review, retention rules, and legal sign-off.
- Validate cold-chain device provider contracts before enabling any live IoT ingestion.

## AI boundary statement

AI must not prescribe, substitute, or approve/release regulated medicines. This pack strengthens evidence and workflow controls only; regulated release approval remains pharmacist-controlled, and AI/system actors are explicitly blocked from approved regulated release evidence.
