# ADDITIONAL_FEATURES.md

## PURPOSE

This document defines **future moat-building features** for the Pharmacy OS.

These are NOT to be implemented blindly.

Rules:

* Core system stability ALWAYS takes priority
* No feature should break:

  * stock invariants
  * one-order-truth
  * audit logging
  * prescription gating
* Features must be implemented in **controlled tranches**
* Each feature must map to existing data models before extension

---

# CATEGORY 1: UNFAIR ADVANTAGE (MOAT BUILDERS)

## 1. Medication Continuity Graph

Goal:
Track full lifecycle of patient medication usage.

System must:

* predict refill timing
* detect missed adherence
* flag interruption risk

AI Layer:

* risk scoring per patient
* refill prediction engine
* automated WhatsApp/pharmacist triggers

Constraints:

* must rely on existing order + prescription + refill data
* must NOT introduce parallel truth systems

---

## 2. Building Health Index

Goal:
Aggregate health signals at building level.

System must compute:

* adherence %
* chronic density
* refill reliability
* emergency usage patterns

AI Layer:

* demand prediction
* outbreak signal detection

Constraints:

* must derive from existing customer + order + medicine data
* no manual input dependency

---

## 3. SLA Reality Engine

Goal:
Replace fake ETA with real prediction.

System must:

* compute delivery ETA based on:

  * stock availability
  * pharmacist queue
  * rider load
  * building latency

AI Layer:

* confidence scoring
* dynamic ETA recalculation

---

# CATEGORY 2: OPERATIONAL AI

## 4. FEFO Intelligence Engine

Beyond FIFO/FEFO rules:

System must:

* predict expiry risk
* suggest batch prioritization

AI Layer:

* SKU-level expiry prediction
* discount/clearance suggestion engine

---

## 5. OCR → Auto Procurement Loop

Flow:
Supplier bill → OCR → match → reorder suggestion

System must:

* parse supplier invoices
* match SKUs
* track price changes

AI Layer:

* optimal reorder quantity
* supplier recommendation

---

## 6. Rider Optimization Brain

System must:

* cluster deliveries
* optimize routes
* reduce time per delivery

AI Layer:

* building-specific delivery behavior learning

---

# CATEGORY 3: CUSTOMER INTELLIGENCE

## 7. Smart Refill Mode

System must:

* pre-create refill orders
* notify customer before stock-out

AI Layer:

* refill prediction
* auto-draft order generation

---

## 8. Family Medicine Graph

System must:

* group patients into households
* track all medicines centrally

---

## 9. Pharmacist Intelligence Layer

System must:

* flag:

  * dosage anomalies
  * duplicate medicines
  * interaction risks

Constraints:

* assist pharmacist, not replace decision

---

# CATEGORY 4: INFRASTRUCTURE PLAYS

## 10. Building Integration Layer

System must:

* map flats → customers
* optimize delivery flow inside building

Future:

* concierge integration
* society app sync

---

## 11. Insurance + Claims Automation

System must:

* generate insurer-ready documentation
* standardize invoice formats

---

## 12. Legacy System Migration Layer (Medivision Bridge)

System must:

* import legacy data
* reconcile:

  * stock
  * customers
  * transactions

Goal:
make switching frictionless

---

# CATEGORY 5: COMPLIANCE + CONTROL

## 13. Compliance Score Engine

System must compute:

* H1 compliance score
* audit completeness
* stock integrity

---

## 14. Medication Demand Heatmap

System must:

* analyze demand at building cluster level
* support inventory planning

---

# LEGACY FEATURE PARITY (MANDATORY)

These must exist before advanced features:

* Purchase
* Sale (counter + prescription)
* Sale return
* Stock adjustment
* Purchase return
* Barcode printing
* Invoice printing
* Payment entry
* GST + regulatory reports
* H1 register
* Accounting basics
* Batch-wise balance
* Stock audit
* Shift closing
* Salesman tracking
* Margin lock system
* Customer ID system
* Customer medicine records
* Bill import (email/WhatsApp)
* Tally compatibility layer

---

# IMPLEMENTATION STRATEGY

Codex must:

1. NEVER implement all features at once
2. ALWAYS:

   * stabilize → extend → verify
3. Introduce features ONLY AFTER:

   * test pass
   * build pass
   * audit integrity confirmed

---

# FINAL RULE

This document is a **directional blueprint**, not a to-do list.

Each feature must be:

* justified
* mapped to schema
* implemented in isolation
* verified before merging
