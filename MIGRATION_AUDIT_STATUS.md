# MIGRATION_AUDIT_STATUS

Migration sequence collision surgery status for `fix/migration-sequence-collision-surgery` on 2026-05-09.

> Scope: migration hygiene / repository integrity only. No product features, runtime business logic, API behavior, SQL body semantics, or service behavior were intentionally changed.

## Audit metadata

| Item | Value |
| --- | --- |
| Branch name | `fix/migration-sequence-collision-surgery` |
| Latest main SHA inspected | `aef2de3` (`Merge pull request #99 from zarjun247/codex/certify-stock-mutation-gateways-and-reporting`) |
| Remote refresh status | Attempted `git fetch origin main`, `git checkout main`, and `git pull --rebase origin main`; unavailable because this checkout has no configured `origin` remote and no local `main` branch. Work proceeded from the local main-equivalent `work` branch tip `aef2de3`. |
| Migration files changed by this PR | Renames only; no new SQL migration bodies were added and no SQL body semantics were changed. |
| Corrected latest numbered migration | `0049_provider_operation_attempts.sql` |
| Next reserved migration number | `0050` |

## Static migration inventory after surgery

| Prefix | Filename | Purpose | Status |
| --- | --- | --- | --- |
| `0000` | `0000_next_leader.sql` | Initial users, auth, core commerce/location schema baseline | Present; unique prefix after surgery |
| `0001` | `0001_massive_wolfsbane.sql` | Audit logs baseline | Present; unique prefix after surgery |
| `0002` | `0002_noisy_leo.sql` | Product category and medicine/compliance product fields | Present; unique prefix after surgery |
| `0003` | `0003_lame_manta.sql` | Store latitude/longitude fields | Present; unique prefix after surgery |
| `0004` | `0004_omniscient_expediter.sql` | Building geolocation/address enrichment | Present; unique prefix after surgery |
| `0005` | `0005_slow_ego.sql` | Product variants | Present; unique prefix after surgery |
| `0006` | `0006_certain_johnny_blaze.sql` | Store service radius/address refinements | Present; unique prefix after surgery |
| `0007` | `0007_military_next_avengers.sql` | User openId nullability/compatibility adjustment | Present; unique prefix after surgery |
| `0008` | `0008_colorful_pyro.sql` | Delivery events | Present; unique prefix after surgery |
| `0009` | `0009_jazzy_patriot.sql` | Helpdesk tickets | Present; unique prefix after surgery |
| `0010` | `0010_tiny_jimmy_woo.sql` | Product image URL fields | Present; unique prefix after surgery |
| `0011` | `0011_parched_krista_starr.sql` | Doctor consult requests | Present; unique prefix after surgery |
| `0012` | `0012_spooky_rachel_grey.sql` | Medivision sync log | Present; unique prefix after surgery |
| `0013` | `0013_light_blackheart.sql` | Discount categories | Present; unique prefix after surgery |
| `0014` | `0014_sloppy_jetstream.sql` | Order status lifecycle expansion | Present; unique prefix after surgery |
| `0015` | `0015_tough_the_stranger.sql` | User role expansion | Present; unique prefix after surgery |
| `0016` | `0016_real_pestilence.sql` | Drug categories | Present; unique prefix after surgery |
| `0017` | `0017_flawless_vermin.sql` | Product barcodes | Present; unique prefix after surgery |
| `0018` | `0018_skinny_black_knight.sql` | Batch ledger | Present; unique prefix after surgery |
| `0019` | `0019_easy_korvac.sql` | AI decisions | Present; unique prefix after surgery |
| `0020` | `0020_tearful_selene.sql` | Delivery tasks | Present; unique prefix after surgery |
| `0021` | `0021_oval_ultimatum.sql` | System events | Present; unique prefix after surgery |
| `0022` | `0022_store_capabilities_gstin.sql` | Store capability GSTIN field | Present; unique prefix after surgery |
| `0023` | `0023_discount_codes.sql` | Discount codes | Present; unique prefix after surgery |
| `0024` | `0024_customer_mobile_persistence.sql` | Notification events and customer mobile persistence | Present; unique prefix after surgery |
| `0025` | `0025_barcode_scan_truth.sql` | Barcode alias scan truth | Present; unique prefix after surgery |
| `0026` | `0026_idempotency_reservations.sql` | Idempotency keys and reservation lifecycle support | Present; unique prefix after surgery |
| `0027` | `0027_invoice_sequences.sql` | Invoice/return sequence uniqueness | Present; unique prefix after surgery |
| `0028` | `0028_accounting_allocation_journal_tally.sql` | Supplier payment allocation, journal, and Tally support | Present; unique prefix after surgery |
| `0029` | `0029_stock_reservation_truth.sql` | Stock reservation truth hardening | Present; unique prefix after surgery |
| `0032` | `0032_h1_statutory_schema.sql` | H1 statutory register schema | Present; unique prefix after surgery |
| `0034` | `0034_prescription_vault_consent.sql` | Prescription vault consent and access audit metadata | Present; unique prefix after surgery |
| `0035` | `0035_refund_ledger.sql` | Refund ledger | Present; unique prefix after surgery |
| `0036` | `0036_credit_note_lifecycle.sql` | Credit note lifecycle | Present; unique prefix after surgery |
| `0037` | `0037_invoice_snapshot.sql` | Immutable invoice snapshots | Present; unique prefix after surgery |
| `0038` | `0038_accounting_journal_batches.sql` | Accounting journal batches and entries | Present; unique prefix after surgery |
| `0039` | `0039_supplier_ageing_reconciliation.sql` | Supplier ageing reconciliation allocation metadata | Present; unique prefix after surgery |
| `0040` | `0040_tally_export_proof.sql` | Tally export proof and duplicate prevention | Present; unique prefix after surgery |
| `0041` | `0041_ocr_invoice_exceptions.sql` | OCR invoice exception workflow | Present; unique prefix after surgery |
| `0042` | `0042_whatsapp_notification_safety.sql` | WhatsApp notification provider safety | Present; unique prefix after surgery |
| `0043` | `0043_privacy_staff_session.sql` | Privacy consents and staff device sessions | Present; unique prefix after surgery |
| `0044` | `0044_index_performance_audit.sql` | Secondary index performance audit | Present; unique prefix after surgery |
| `0045` | `0045_provider_webhook_events.sql` | Provider webhook event ledger | Present; unique prefix after surgery |
| `0046` | `0046_commercial_event_ledger.sql` | Commercial lifecycle event ledger | Present; unique prefix after surgery |
| `0047` | `0047_worker_jobs.sql` | Worker job queue durability | Present; unique prefix after surgery |
| `0048` | `0048_rbac_staff_session_governance.sql` | Runtime RBAC and privileged staff session governance | Present; unique prefix after surgery |
| `0049` | `0049_provider_operation_attempts.sql` | Provider operation attempt ledger and notification status expansion | Present; unique prefix after provider runtime rebuild |

Non-numbered SQL files remain present and intentionally outside the numbered Drizzle sequence: `part10_whatsapp.sql`, `part11_routing_rider.sql`, and `part12_system_events.sql`.

## Duplicate prefixes found before surgery

| Duplicate prefix | Files found at that prefix before surgery | Resolution |
| --- | --- | --- |
| `0045` | `0045_commercial_event_ledger.sql`; `0045_provider_webhook_events.sql` | Kept the earlier local merge (`0045_provider_webhook_events.sql`, PR #85) at `0045`; moved commercial lifecycle ledger to `0046`. |
| `0046` | `0046_rbac_staff_session_governance.sql`; `0046_worker_jobs.sql` | Preserved local merge chronology by moving worker jobs to `0047` and RBAC/session governance to `0048`. |

Historical gaps `0030`, `0031`, and `0033` remain. They pre-date this collision surgery and were not renumbered in order to avoid rewriting already-merged migration history beyond the specific duplicate-prefix repair.

## Exact renames performed

| Old filename | New filename |
| --- | --- |
| `drizzle/0045_commercial_event_ledger.sql` | `drizzle/0046_commercial_event_ledger.sql` |
| `drizzle/0046_worker_jobs.sql` | `drizzle/0047_worker_jobs.sql` |
| `drizzle/0046_rbac_staff_session_governance.sql` | `drizzle/0048_rbac_staff_session_governance.sql` |

No migration was deleted. No separate migrations were combined.

## Migration proof status

| Proof item | Status |
| --- | --- |
| Static duplicate prefix check | Passed: `node scripts/verify-migrations.mjs` reports 49 SQL files, 46 numbered migrations, latest `0048`, and 0 blocking issues. |
| Governance duplicate migration scan | Migration duplicate check is clean, but full `node scripts/ci-governance-guards.mjs all` currently fails on pre-existing provider/stock findings outside this migration-only scope. |
| Fresh DB migration proof | Not proven in this container. No `TEST_DATABASE_URL` is configured, so DB-backed lifecycle smoke is skipped by the test suite. |
| Existing DB upgrade proof | Not proven in this container. No existing database URL was supplied for an applied-state upgrade replay. |
| Drizzle metadata journal | `drizzle/meta/_journal.json` and snapshots still stop at `0021`; this PR did not update metadata because the repository already uses hand-written SQL history after `0021`. |

## Operator caveat for already-applied external migrations

If any environment has already applied the duplicated filenames (`0045_commercial_event_ledger.sql`, `0046_worker_jobs.sql`, or `0046_rbac_staff_session_governance.sql`) before this repository repair, operators must reconcile that environment's migration ledger before applying the renamed sequence. Do not blindly replay against production: compare the applied migration table, table/index existence, and SQL bodies, then mark or forward-fix the migration ledger according to the deployment runbook.

## Open PR migration rebuild requirement

Any open PR that adds a migration using stale numbers `0045`, `0046`, `0047`, or `0048` must be rebuilt from this branch/latest main-equivalent history and assigned `0049` or later. PRs #94/#95/#96 style schema branches must use the next available number after this fix. Duplicated stale schema PRs must not merge raw.

## Remaining migration risks

| Severity | Risk | Required follow-up |
| --- | --- | --- |
| P0 | Fresh/existing DB migration replay has not been proven in this container. | Run DB-backed fresh and upgrade smoke with `TEST_DATABASE_URL` before claiming production-safe migration status. |
| P1 | Drizzle metadata journal stops at `0021` while SQL migrations continue through `0048`. | Dedicated metadata reconciliation decision: document manual SQL mode or regenerate metadata in a controlled PR. |
| P1 | Historical sequence gaps `0030`, `0031`, and `0033` remain. | Maintain as documented historical skips unless maintainers provide evidence of missing migration files. |
| P2 | Live open PR migration diffs were not verifiable from this unauthenticated/no-origin checkout. | Merge captain must inspect open PR changed files before allowing schema work to proceed. |
