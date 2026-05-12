# FUTURE_FEATURES.md — Deferred Features

These 4 features are architecturally scaffolded but intentionally deferred. They require human decisions or external integrations before activation.

## 1. SMTP / SES Breach Notification Dispatch

**Status:** Dispatcher wired (`breachNotificationDispatcher.ts`). Generates correct payload. Missing: real email transport.

**What's needed:** SMTP credentials or AWS SES configuration. Set `BREACH_NOTIFY_RECIPIENT_EMAIL` in production env.

**Unblocked by:** Human — see SCORECARD.md item 4.

---

## 2. Doctor Consult Booking

**Status:** Page scaffolded (`DoctorConsult.tsx`), tRPC route exists, `doctorConsultRequests` table created. No doctor availability backend yet.

**What's needed:** Doctor availability API integration or manual scheduling backend.

**Unblocked by:** Business decision on doctor partner network.

---

## 3. Multi-Store Intelligence (Phase: scaled)

**Status:** Intelligence services fully implemented (continuity graphs, refill risk, stockout forecasting). Phase-gated at `scaled`.

**What's needed:** Promote `APP_PHASE=scaled` after multi-store QA pass — see SCORECARD.md item 8.

**Unblocked by:** Human — store-level validation and sign-off.

---

## 4. Supplier Payment Reconciliation Automation

**Status:** `AdminSupplierPayments` page exists. Manual entry only. No bank feed integration.

**What's needed:** Bank API / account aggregator integration. Requires RBI-registered AA partner.

**Unblocked by:** Regulatory (RBI AA framework) + business partner selection.
