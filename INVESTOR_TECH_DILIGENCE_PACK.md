# Investor Technical Diligence Pack

Updated: 2026-05-10.

## Executive summary

This system is a residential medication infrastructure platform: it combines customer ordering, prescription governance, pharmacist workflows, stock/reservation truth, delivery operations, provider integrations, statutory/accounting surfaces, observability, and deployment controls in one MySQL-backed operating model. It should not be positioned as a lightweight pharmacy storefront or point solution; the core technical value is the ability to coordinate regulated household medication demand with store-level inventory, professional review, payment/provider events, delivery, audit, and accounting workflows.

Current posture:

- **Investor demo:** allowed when supervised.
- **Controlled internal pilot:** possible with caution.
- **Multi-store beta:** not yet ready.
- **Race-mode unsupervised production:** not allowed yet.

The most important diligence truth is that the platform has materially advanced from UI/application coverage toward durable operational proof: local MySQL-backed concurrency proof is green, stock mutation gateways are defined and guarded, provider retry/dead-letter and refund reversal seams are tested, observability is staff/admin gated, and deployment/runtime readiness endpoints exist. The remaining scale blockers are mostly operational proof, hosted CI parity, staging restore evidence, provider verification, ownership sign-off, and a supplier-invoice hard-uniqueness backfill/constraint.

## Architecture overview

### Runtime shape

- **Frontend:** React 19 + Vite + TypeScript application, with tRPC/React Query client access to server procedures.
- **Backend:** Node.js/Express server exposing tRPC under `/api/trpc`, provider/webhook routes, storage proxy routes, OAuth routes, health/readiness routes, observability routes, and a protected worker trigger.
- **Database:** MySQL accessed through Drizzle ORM, with SQL/Drizzle migrations under `drizzle/` and validation scripts for migration integrity.
- **Worker model:** Queue/worker primitives process OCR/provider/notification-style background jobs, with retry/dead-letter visibility surfaced through durable tables and observability metrics.
- **Security model:** Request context, protected/staff/admin procedures, HTTP security middleware, redaction utilities, staff-session governance, store-scope checks, and fail-closed provider/config validation.

### Main domain modules

The tRPC router surface includes customer, staff, pharmacist, inventory, inventory ledger, purchase, sales, reports, OCR, prescription governance, payment, delivery, command center, deployment readiness, and multi-store runtime modules. This is important for diligence because the system boundary spans demand creation, regulated review, fulfillment, and back-office reconciliation rather than only checkout or catalog browsing.

### Data/control plane split

- **Transactional plane:** purchases, sales, reservations, stock movements, batch ledger, prescriptions, payments, refunds, provider webhooks, delivery tasks, audits, supplier invoices, and accounting journal batches.
- **Read/operational plane:** dashboard routes, observability metrics, health/readiness, runtime store-isolation checks, reports, reconciliation outputs, and deployment readiness views.
- **Governance plane:** static guard tests, migration verification, release gates, environment validation, secret/provider hygiene, stock truth scanners, and DB-backed concurrency proof.

## Stock truth

### Canonical stock posture

The system treats stock as an invariant-controlled domain, not as a mutable UI number. Physical inventory-affecting writes are expected to pass through approved stock/reservation gateways, including purchase commit, sale confirmation, sale return, stock adjustment, purchase return, quarantine, disposal, transfer receive, quarantine release, opening stock/batch creation, audit correction, and durable reservation lifecycle.

### Canonical availability formula

The canonical availability model is:

```text
available = onHand - activeReserved - quarantined/unavailable - blocked/expired where applicable
```

This distinction matters commercially: app-visible availability may be clamped for customers, but raw negative or inconsistent availability is still surfaced for reconciliation and operations.

### FEFO and batch controls

The stock truth layer includes FEFO helpers that prefer earliest valid expiry, exclude expired/quarantined/recalled/damaged/blocked batches, and require audit reasons for manual FEFO deviation. That is medication-infrastructure behavior: fulfillment quality depends on batch state and expiry policy, not just SKU quantity.

### Lookup vs mutation boundaries

Barcode and OCR paths are intended to remain lookup/draft workflows. Barcode lookup must not mutate stock movements, batch ledger, or store SKU quantities. OCR purchase ingestion must hand off to the purchase commit path rather than directly changing inventory. Purchase commit and sale confirmation are expected to route through stock invariant gateways and then resync aggregate read models.

### Stock truth still not overclaimed

The stock truth documents are explicit that live-store proof requires DB-backed execution and production-like data. The current posture is strong guard coverage plus local DB-backed concurrency proof for key race seams, not a claim that every production store has been reconciled.

## Commercial truth

### Commercial lifecycle coverage

The commercial lifecycle model covers:

- purchase commit increasing canonical stock and supplier outstanding;
- POS/app sale confirmation decrementing stock and creating reporting impact;
- app reservation create/release/consume flows;
- prescription/H/H1 gated sale contexts;
- payment verification and paid sale state;
- delivery completion;
- sale return stock/refund/report reversal behavior;
- purchase return stock/supplier outstanding impact;
- supplier payments reducing outstanding;
- stock reconciliation, GST reporting, H1 completeness, and supplier outstanding reports.

### Idempotency and replay posture

The system has dedicated idempotency/race seams for invoice reservation, purchase commit, sale confirmation, provider payment webhook replay, refund replay/over-refund, provider retry/dead-letter insertion, and reservation terminal state. These are the right commercial boundaries: duplicate clicks, provider retries, webhook replays, and competing stock claims are expected conditions, not exceptional edge cases.

### Commercial truth caveat

Earlier commercial harness coverage was integration-style and static because the repository did not originally have a test DB lifecycle. The latest main truth now records local real MySQL proof for the highest-risk concurrency seams. Hosted CI MySQL 8.4 observation is still required before claiming parity across runner environments.

## DB concurrency proof

### Current proof status

DB-backed MySQL concurrency proof is **claimed locally** for this checkout. The recorded proof used:

```bash
pnpm run test:db:bootstrap
pnpm run test:db:concurrency
```

against:

```text
TEST_DATABASE_URL=mysql://247_test_user:247_test_password@127.0.0.1:3307/247_customer_app_test
```

The MySQL-backed harness passed **11 tests** in `server/mysql-concurrency.integration.test.ts`.

### Cases covered

The DB proof covers:

1. last-unit reservation atomic predicate;
2. POS sale vs app reservation last-unit race;
3. concurrent invoice number reservations;
4. provider webhook replay uniqueness;
5. refund replay uniqueness;
6. H1 sale-line duplicate registration uniqueness;
7. purchase commit double-submit;
8. sale confirmation double-submit;
9. payment webhook replay through the raw Razorpay webhook seam;
10. refund replay / over-refund settlement;
11. reservation payment-vs-expiry terminal race.

### Why this matters for investors

Medication commerce fails at the seams: last-unit inventory, duplicate provider callbacks, double-submitted sale/purchase commits, refund replay, and reservation expiry races. A UI-only system can look complete while still overselling, double-posting, or losing statutory records. The DB proof shows that the highest-risk race surfaces have real MySQL-backed coverage locally.

### Remaining DB proof gap

Hosted CI parity still needs to be observed through the checked-in MySQL 8.4 workflow. Local proof is meaningful, but production diligence should require archived GitHub Actions evidence for the target branch before declaring the race-mode posture scale-ready.

## Observability

### Implemented/hardened foundation

The observability foundation is useful but intentionally not overclaimed as a complete command center. Current backed surfaces include:

- `/metrics` backed by Prometheus registry plus database refresh for provider/dead-letter/worker counts;
- `/api/observability/dashboards` backed by static dashboard definitions and a supported metric catalog;
- `/api/observability/health-summary` backed by provider event visibility;
- `/api/observability/provider-events` backed by provider webhook events, provider dead letters, and worker jobs.

These endpoints are staff/admin gated, and HTTP request logging sanitizes sensitive identifiers/path labels. Provider/dead-letter metrics are derived from durable runtime tables, not synthetic counters.

### Explicit observability non-claims

The current platform does **not** yet claim:

- synthetic provider uptime boards;
- fake incident counts;
- stock anomaly dashboards before anomaly rules derive from canonical stock/reservation/ledger flows;
- audit anomaly dashboards before durable audit rules exist;
- refill/reconciliation dashboards without real runtime counters;
- PHI/PII payload logging.

That restraint is investor-positive: the codebase is moving toward evidence-backed observability rather than demo dashboards.

## Accounting and compliance operations

### Accounting/tax surfaces

The system contains accounting and statutory foundations across:

- GST/invoice/report exports;
- journal batch concepts and balanced accounting reversals;
- supplier ledger/outstanding reports;
- purchase invoice and purchase return flows;
- sale return/refund reversal handling;
- Tally/export proof work;
- audit logs for regulated and commercial decisions.

Successful provider refund settlement now posts a balanced refund accounting reversal through existing journal batches exactly once; failed refund webhooks do not post reversal entries. This separates provider event receipt from accounting recognition.

### Regulated pharmacy controls

The compliance posture includes prescription governance, H/H1 gate behavior, H1 register creation, pharmacist/staff controls, store isolation/RBAC, prescription vault/consent foundations, and privacy handling rules. H/H1/prescription-required products cannot be released through ordinary confirmation paths without clearance.

### Compliance caveat

This repository contains a strong technical compliance foundation, not final legal sign-off. Counsel and pharmacy operations still need to approve retention policy, statutory forms, regulated release SOPs, H1 completeness obligations, privacy notices, breach response thresholds, and jurisdiction-specific requirements.

## Deployment readiness

### Current production readiness truth

The current production readiness score recorded in the main truth is **72/100**. Deployment/runtime readiness routes and multi-store runtime surfaces exist, including safe health/readiness/degraded-mode visibility, worker/provider/queue health visibility, and aggregate store-isolation checks.

### Launch-mode interpretation

- **Investor demo:** allowed for supervised walkthroughs and proof review.
- **Controlled internal pilot:** possible only with caution and explicit operational controls.
- **Multi-store beta:** blocked until hosted CI parity, provider verification, restore evidence, owner assignment, and runtime data proof are complete.
- **Unsupervised race-mode production:** blocked until CI/restore/provider/ops proof closes.

### Deployment evidence still required

The codebase does not claim production deployment proof. Diligence should require CI/CD logs, release artifact IDs, runtime URL checks, rollback evidence, staging backup/restore drill evidence, provider sandbox/production verification, and on-call/owner sign-off.

## AI governance boundaries

### Current AI role

AI-adjacent capabilities are treated as assistance and ingestion support, not autonomous regulated fulfillment. OCR ingestion may extract purchase/invoice content into reviewable drafts; assistant/chat/helpdesk-style workflows may guide or summarize; queue infrastructure can support future AI jobs. None of these should bypass pharmacist, compliance, stock, payment, or accounting gates.

### Boundaries that must remain intact

- AI/OCR must not directly mutate physical stock.
- AI/OCR must hand off to reviewed purchase/sale/commit workflows.
- AI must not approve prescription-required, H/H1/X, margin-loss, refund, or statutory decisions autonomously.
- AI outputs must be auditable as suggestions/extractions with model/confidence/decision metadata where applicable.
- AI must not log PHI/PII, raw prescription images, payment secrets, OTPs, tokens, cookies, or full customer contact data.
- AI must not fabricate provider success, inventory availability, accounting posting, delivery status, or deployment readiness.

### Investor framing

The defensible AI posture is not “replace the pharmacist.” It is “reduce operational load while preserving deterministic regulated controls.” This is a better infrastructure story than a generic AI pharmacy assistant.

## Remaining blockers before scale

### P1 blockers

1. **Deployment evidence missing:** no production deployment proof is claimed.
2. **Hosted CI MySQL 8.4 observation:** local MySQL proof is green, but hosted workflow evidence must be archived.
3. **Backup/restore drill evidence:** dry-run scripts/runbooks exist; measured staging restore proof is still required.
4. **Provider verification:** payment, WhatsApp/SMS, maps, OCR, printer, storage, and Tally integrations need staging/sandbox verification without fake-success claims.
5. **Operational ownership:** owners must be assigned for dead letters, incidents, degraded mode, backup/restore, provider outages, and store-isolation anomalies.
6. **Multi-store runtime data proof:** staff/admin-gated aggregate checks must be run against staging/production-like data and recorded.
7. **Supplier invoice hard uniqueness:** existing supplier + store + invoice number data requires business review/backfill before adding a hard destructive-risk unique constraint.

### P2/P3 scale items

- Performance proof with live MySQL `EXPLAIN`/benchmark evidence on dashboard and report paths.
- Full production alert wiring and on-call runbooks.
- Deeper store/customer/family authorization model.
- Provider reconciliation dashboards and incident workflows backed by durable data.
- Final statutory/compliance counsel review.
- Production data migration/reconciliation plan for real stores.
- Security/supply-chain hardening gates such as dependency audit and dedicated secret scanning.

## Why this is residential medication infrastructure, not just pharmacy software

This platform is infrastructure because it coordinates the full residential medication operating loop:

1. **Household demand capture:** customer profiles, locations/buildings/flats, cart/checkout, refills, reminders, consults, WhatsApp/helpdesk, and family-style medication needs.
2. **Regulated clinical/compliance gates:** prescription vault, pharmacist workbench, H/H1 handling, H1 register, consent/audit, and controlled release paths.
3. **Inventory truth at fulfillment time:** batch ledger, reservations, FEFO, quarantine/expiry/disposal, purchase/sale returns, and no-rogue-mutation stock gateways.
4. **Commercial settlement:** invoice numbering, payments, provider webhooks, refunds, supplier invoices, supplier payments, GST/reporting, and accounting journal reversals.
5. **Operational last mile:** delivery tasks, rider/store workflows, SLA concepts, notifications, provider retries, queues, and dead-letter handling.
6. **Governance and proof:** DB-backed race tests, migration verification, release gates, observability hardening, deployment readiness checks, and explicit non-claim discipline.

Ordinary pharmacy software often records transactions after staff already know what happened. Residential medication infrastructure must decide what can safely happen next: whether a household can reserve the last strip, whether an H1 medicine can be released, whether a provider callback is replayed, whether a refund should reverse accounting, whether a batch is expired/quarantined, whether a store can fulfill a building, and whether operations can prove readiness before scaling. This repository is being built around those infrastructure decisions.

## Diligence conclusion

The system is credible for supervised investor diligence and controlled internal proof because it has moved beyond surface demos into stock truth, commercial idempotency, MySQL concurrency proof, observability hardening, and deployment-readiness instrumentation. It should not yet be marketed as multi-store race-mode production-ready. The next diligence milestone is evidence closure: hosted CI MySQL 8.4 proof, staging restore drill, provider verification, owner sign-off, runtime data checks, and supplier-invoice uniqueness backfill/constraint.
