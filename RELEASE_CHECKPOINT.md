# Release Checkpoint — Tranche 10 (Final Go-Live / Pilot Launch)

- **Branch:** `work`
- **Commit (base before this checkpoint commit):** `158b2bc`
- **Release date (UTC):** 2026-05-01

## Modules completed
- Customer app core journeys (auth, onboarding, catalog, cart, orders, Rx upload).
- Staff/Pharmacy workflows (purchase, OCR, reports, shift, expiry, barcode, GST export).
- Admin console modules (command center, sales, inventory, delivery, WhatsApp, masters, accounting).
- Role/route protection hardening for admin and staff route groups.
- Seed + migration readiness documentation for pilot bootstrap.

## Validation status
- Typecheck: **pass**
- Unit tests: **pass** (6 files, 73 tests)
- Production build: **pass**

## Known warnings
- Vite build warns analytics env placeholders are undefined if analytics env vars are not set.
- Vite build warns about large client chunk size (>500 kB).

## Known gaps
- `store_capabilities.gstin` added via migration; must be applied in target DB before pilot.
- Route protection now enforced at frontend route level; backend already enforces role checks per router.
- Pilot seed still split across scripts (`seed-locations` + `seed-medivision`); run in documented order.

## Install steps
1. `pnpm install`
2. Copy `.env` from deployment template and set DB + payment + OTP + analytics values.
3. `pnpm run check && pnpm test && pnpm run build`

## Migration steps
1. Apply Drizzle SQL migrations in order.
2. **Exact command:** `pnpm drizzle-kit migrate`
3. Confirm `drizzle/0022_store_capabilities_gstin.sql` is applied.

## Seed steps
1. `node scripts/seed-locations.mjs`
2. `node scripts/seed-medivision.mjs`
3. (Optional sanity) `node scripts/seed.mjs` for lightweight local demo data.

## Publish / deploy steps
1. Build: `pnpm run build`
2. Start app in production env (your process manager/container entrypoint for `dist/index.js`).
3. Smoke test key routes and pilot transactions.
4. Export code archive from current branch commit for downloadable pilot package.

## Rollback plan
- Rollback app artifact to previous successful commit.
- Rollback DB by restoring pre-migration backup snapshot (recommended for pilot) or manually reverting latest SQL migration(s).
- Re-seed from known-good seed scripts if data reset is required.

## Pilot readiness score
- **8.8 / 10** (release-candidate ready for single-store pilot with noted warnings/gaps).
