# 24/7 Pharmacy OS Blueprint

## 1) 24/7 Pharmacy OS
- Store operations.
- Master product registry.
- Batch inventory.
- Purchase/inwarding.
- Pharmacist review.
- Returns, transfers, disposal.
- GST/Tally exports.
- Staff and role controls.

## 2) 24/7 Customer App
- OTP login.
- Building/flat onboarding.
- Catalogue.
- Rx upload.
- Order tracking.
- Payments.
- Refill reminders.
- Invoices.
- Trust/compliance explainer.

## 3) 24/7 Bridge / Orchestrator
- One-order-truth data model.
- Order state machine.
- Node resolver.
- SLA engine.
- WhatsApp bot + notifications.
- Rider assignment.
- Sync adapters.
- Event bus.
- Command center.

## 4) 24/7 AI Mind
- OCR + parsing.
- Product matching.
- Demand forecasting.
- Expiry scoring.
- Route suggestions.
- Anomaly detection.
- Summaries only.

## Non-Negotiables
- AI must never autonomously approve prescriptions, substitute/select medicines, decide dosage, provide treatment advice, or release Rx/H/H1/X items.
- Pharmacist-gated dispensing is mandatory.
- Batchwise stock truth, FEFO, stock movements, audit logs, and one-order-truth across app/WhatsApp/counter are mandatory.
- Inwarding must support supplier bill upload/photo/PDF/CSV, OCR parse, product matching, review queue, purchase draft, batch creation, barcode generation, and stock commit only after human approval.
- WhatsApp must not become a shadow order book.
- Every WhatsApp/app/counter order must map to the same order/state-machine tables.
- Command center must expose SLA, expiry, refill, rider, OCR, WhatsApp, stockout, manual override, sync/compliance health truth.
- Reports/accounting/GST/Tally outputs must derive from real sale/purchase/stock/audit data.
