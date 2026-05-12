# FUTURE_FEATURES.md — Post-Launch Roadmap

These four features are the committed post-launch roadmap for 247 Pharmacy OS.
They are deliberately excluded from the launch scope and must not be started
until the store is live, evidence-driven, and operationally stable.

---

## 1. Medication Continuity Graph

**Goal:** Track the full lifecycle of each patient's medication usage to
eliminate continuity gaps for chronic conditions.

System must:
- Predict refill timing based on historical order cadence and prescription data
- Detect missed adherence events and flag interruption risk
- Trigger automated WhatsApp or pharmacist outreach when risk is elevated

AI layer:
- Per-patient risk scoring
- Refill prediction engine trained on order + prescription history

Constraints:
- Must rely solely on existing order, prescription, and refill data
- Must NOT introduce a parallel truth system alongside the existing order ledger

---

## 2. Building Health Index

**Goal:** Aggregate health signals at the building level to enable predictive
inventory positioning and early demand/outbreak detection.

System must compute per building:
- Chronic medication adherence rate
- Chronic disease density
- Refill reliability score
- Emergency medication usage patterns

AI layer:
- Demand forecasting by building
- Outbreak/epidemic signal detection from consumption anomalies

Constraints:
- Must derive entirely from existing customer, order, and medicine data
- No manual input dependency; fully automated signal aggregation

---

## 3. Smart Refill Mode

**Goal:** Eliminate stock-out events for chronic patients by pre-creating
refill orders before the patient runs out.

System must:
- Pre-create refill orders when predicted refill date approaches
- Notify the customer before their supply drops to zero
- Require explicit customer consent before auto-generating any order

AI layer:
- Refill timing prediction per patient
- Auto-draft order generation from last prescription + refill pattern

---

## 4. OCR → Auto Procurement Loop

**Goal:** Close the loop from supplier invoice to reorder decision without
manual data entry.

Flow: Supplier bill → OCR parse → SKU match → reorder suggestion → buyer review

System must:
- Parse supplier invoices via the OCR provider pipeline
- Match parsed line items to existing SKUs in the catalog
- Track supplier price changes over time
- Surface reorder suggestions with quantity recommendations

AI layer:
- Optimal reorder quantity calculation (EOQ + FEFO-aware)
- Supplier recommendation based on price trend and reliability

---

> Last updated: 2026-05-12. Reassess priority order after first 90 days of
> live operation. See `docs/research/ADDITIONAL_FEATURES.md` for the full
> backlog of 14 candidate features.
