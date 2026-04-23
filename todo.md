# 24/7 Customer App — TODO

- [x] Global design system: dark theme, Inter font, teal accent, CSS variables
- [x] Database schema: buildings, stores, products, batches, orders, prescriptions, cart, refill_reminders, whatsapp_sessions
- [x] Seed data: sample buildings, stores, products with stock
- [x] Auth flow: OTP phone login page
- [x] Onboarding: building and flat selection after first login
- [x] User profile page with building/flat info
- [x] Product catalog page (node-filtered, real-time stock)
- [x] Product search (name, generic, brand)
- [x] Cart page with item management
- [x] Checkout with SLA window display and inventory soft-lock
- [x] Rx upload: image capture, secure S3 storage
- [x] Rx status tracker (Pending OCR, Pharmacist Reviewing, Approved, Rejected)
- [x] Order lifecycle tracking (Pharmacist Reviewing, Picking, Out for Delivery, Delivered)
- [x] Reorder from past orders (one-tap)
- [x] Refill reminders engine (chronic medication detection)
- [x] Invoices page (per-order invoice download link)
- [x] WhatsApp bot webhook: search flow
- [x] WhatsApp bot webhook: reorder flow
- [x] WhatsApp bot webhook: Rx upload flow
- [x] WhatsApp bot webhook: order status flow
- [x] WhatsApp bot webhook: refill prompt flow
- [x] Vitest coverage: 19 tests (auth, state machine, FEFO, expiry, soft-lock, refill, WhatsApp)
- [x] Final checkpoint and delivery

## Refinement Pass (v2)
- [x] Re-seed database with real Medivision products (72 SKUs from TFS LUX PHARMACIES stock report, 288 store SKUs)
- [x] Remove all fake browser/path preview wrappers
- [x] Redesign global design system: tighten typography, spacing, hierarchy
- [x] Remove all retail/quick-commerce UX cues (oversized FABs, gamification residue)
- [x] Replace all placeholder copy with premium healthcare-operating language
- [x] Refine catalog page: clinical product cards, no retail energy
- [x] Refine cart page: SLA as operational commitment, not delivery promise
- [x] Refine order tracking: state machine as infrastructure status, not delivery tracker
- [x] Refine Rx upload: secure vault language, not upload widget
- [x] Refine refill reminders: chronic medication management, not reminder app
- [x] Refine profile page: operational identity, building node assignment, not account settings
- [x] Improve empty states with operational context
- [x] Integrate Google Maps for node selection (onboarding), ETA (order tracking), rider location (NodeMap component, dark-styled)
- [x] Tighten AppLayout navigation: remove path-based wrappers

## Full Catalogue Ingestion (v3)
- [x] Extract full 4,253-row Medivision PDF into structured JSON (4,159 unique SKUs via PyMuPDF)
- [x] Update DB schema: category, companyName, imageApprovalStatus on products; lat/lng on stores
- [x] Build batch-wise ingestion script (4,159 products, 16,636 store SKUs, 4,253 batches via bulk INSERT)
- [x] Build SKU deduplication logic (catalogue API groups by productId, one row per SKU per store)
- [x] Build image enrichment pipeline (SVG branded placeholders per category, admin approval queue in schema)
- [x] Update catalogue API: category filter, pagination (60/page), search across brand/generic/company
- [x] Remove all "node" language from customer-facing screens
- [x] Replaced with "Serving pharmacy", "Local 24/7 pharmacy", "Fulfilled by 24/7"
- [x] Integrate real store locations (Hiranandani, Powai, Chandivali, Kanjurmarg) with lat/lng
- [x] Add product category filters to catalogue (Medicines, Devices, Nutrition, General, Baby, Wellness)
- [x] Admin image approval queue (imageApprovalStatus field in products schema, enrichment pipeline built)

## System Grounding (v4 — Production Upgrade)
- [x] Audit and document all demo data currently in DB (buildings, stores, products)
- [x] Remove all demo buildings (Bangalore/fake data) — none found, buildings are Mumbai-area
- [x] Remove all demo stores (fake coordinates, placeholder names) — stores already have real Mumbai coords
- [x] Remove all sample product seed data — confirmed all 4,159 products are real Medivision data
- [x] Remove all fake/placeholder coordinates — stores already have real lat/lng
- [x] Add serviceRadius (meters) column to stores table
- [x] Add lat, lng columns to buildings table
- [x] Add assignedStoreId FK to buildings table (primaryStoreId + fallbackStoreId)
- [x] Generate and apply Drizzle migration for schema changes (migration 0004 applied)
- [x] Implement building-first routing engine (3-pass: primary → geo nearest → stock filter) in server/routing.ts
- [x] Integrate Google Maps Distance Matrix API for real ETA (5-min picking buffer, fallback to slaMins)
- [x] Expose routing as tRPC procedure: routing.resolve + catalog.store upgraded with etaMins, displayLabel, resolutionPath
- [x] Wire ETA into catalog.store response
- [x] Remove ALL remaining customer-facing "node" / "pharmacy node" language (Profile, Cart, Home, Onboarding, AppLayout)
- [x] Replace with "24/7 Pharmacy", "Serving pharmacy", "Local 24/7 store", "Fulfilled by 24/7"
- [x] Write routing engine unit tests (Haversine, 3-pass resolution, ETA fallback covered in pharmacy.test.ts)
- [x] Produce routing logic documentation (ROUTING.md)

## Catalogue Upgrade — Product Hierarchy (v5)

- [x] Audit current schema: products, store_skus, batches table structures
- [x] Add product_variants table to Drizzle schema (strength, packSize, form, unit)
- [x] Update store_skus and batches to reference variantId instead of productId
- [x] Generate and apply Drizzle migration for variant layer
- [x] Build Python normalization pipeline: parse full PDF, normalize SKU names, extract variants
- [x] Deduplicate products by normalized brand name + molecule
- [x] Classify all SKUs into categories (Medicines, OTC, Devices, Nutrition, General, Baby, Wellness)
- [x] Run full bulk ingestion: products → variants → store_skus → batches
- [x] Update getCatalog query to join variants and return variant-aware data
- [x] Update catalog.list tRPC procedure to expose variant information
- [x] Validate data integrity: linkage, stock accuracy, deduplication
- [x] Produce full integrity report (counts, category breakdown, normalization logic)

## Medication Continuity Infrastructure UI (v6 — Full Rebuild)

- [x] New design system: white base, soft grey, primary blue #1F6FEB, Inter font, 1.5 line-height, soft shadows, 10-12px radius, no gradients
- [x] Rebuild index.css: light theme CSS variables, remove dark/neon tokens
- [x] Rebuild AppLayout: clean white nav, minimal bottom bar, no commerce language
- [x] Rebuild Home: Active Medications section, Running Low CTA, Recently Ordered, minimal search entry
- [x] Rebuild Catalog: predictive search, clinical product cards (name/dosage/availability/ETA), no grid clutter
- [x] Rebuild Prescription flow: full-screen trust UI, pharmacist review states (Received → Being Verified → Approved)
- [x] Rebuild Cart/Checkout: split Rx/non-Rx, prescription gate before checkout, "Confirm Order" CTA
- [x] Rebuild Order Tracking: human-language states, progress bar, ETA text (~18 min)
- [x] Rewrite all microcopy: remove SLA/node/processing/checkout language
- [x] Remove all dark/neon colors, gradients, glow effects
- [x] Normalize spacing: large whitespace, minimal borders, soft shadows throughout

## Final UI Refinement Pass (v7 — Brand Polish)

- [x] Product card: category icon placeholder (medicine/device/baby/nutrition/general), compact visual zone
- [x] Product card: soft availability language (Available now / Available on request / Arranging / Prescription review required)
- [x] Product card: stronger Rx treatment — "Prescription required" label, not tiny badge
- [x] Product card: premium Add CTA — controlled, not retail-aggressive
- [x] Empty state — Orders: action state with Search medicine + Upload prescription CTAs
- [x] Empty state — Refills/Schedule: reassurance copy, explain how reminders work
- [x] Empty state — Home: guidance state with Upload / Search / Reorder options, remove "Browse medications"
- [x] Trust signals: Verified pharmacist, Licensed dispensing, Secure prescription records in right places
- [x] Continuity cues: Recently ordered, Running low, Prescription under review — calm and intelligent
- [x] Brand palette audit: #111827 text, #667085 secondary, #E5E7EB borders, #F8FAFB surfaces
- [x] Remove all "Browse medications" language
- [x] TypeScript clean + 36 tests passing

## Header, Account & Design System Refinement (v8)

- [x] Header: human ETA language ("Arriving in ~35 min"), building name, pharmacy name, no backend terms
- [x] Header: mobile location strip — building + flat, "Pharmacy open" status
- [x] Account page: replace "Assigned pharmacy active" with actual pharmacy name + address
- [x] Account page: shorter, calmer compliance text
- [x] Account page: keep stats, history, prescriptions, refill schedule sections
- [x] Design system: unify card radius (12px everywhere), chip styles, badge styles
- [x] Design system: typography hierarchy — title 20px, section 16-18px, body 15-16px, relaxed line-height
- [x] Design system: icon weights consistent (strokeWidth 1.5 for decorative, 2 for interactive)
- [x] Design system: status color tokens used consistently across all pages
- [x] Design system: spacing rhythm — 8px base unit, sections 24-32px apart
- [x] TypeScript clean + 36 tests passing

## Premium Dark Theme Conversion (v9)

- [x] Rebuild index.css: deep charcoal token system, electric blue primary, pharmacy green trust, no gradients/glow
- [x] Rebuild AppLayout: dark nav bar, single compact context bar (building · pharmacy · open · ETA), no repetition
- [x] Rebuild Home: dark continuity dashboard, correct empty state copy, no retail feel
- [x] Rebuild Catalog: dark product cards, category icons, soft availability language, refined Add CTA
- [x] Rebuild Cart: dark surfaces, split Rx/non-Rx, Confirm Order CTA
- [x] Rebuild RxUpload: dark premium upload card, dashed border, 3-bullet compliance
- [x] Rebuild OrderDetail: dark tracking states, progress bar, human-language copy
- [x] Rebuild Orders: dark list view, action empty state
- [x] Rebuild RefillReminders: dark calm schedule, correct empty state copy
- [x] Rebuild Profile/Account: dark identity card, serving pharmacy card, quick links, concise compliance
- [x] TypeScript clean + 36 tests passing

## Cinematic Splash Screen (v10)

- [x] Inspect logo asset, main.tsx, App.tsx entry points
- [x] Build SplashScreen component: matte black, logo reveal, blue slash glow trace, green 7 pulse, tagline fade, loading state cycle
- [x] Add touch/pointer ripple and subtle tilt parallax on pointer move
- [x] Wire splash into app entry with controlled dismiss after loading states complete
- [x] TypeScript clean + 36 tests passing

## Auth Flow, Catalog Bug Fix & Mobile Polish (v11)

- [x] Diagnose new-user catalog bug: trace onboarding, building assignment, catalog query
- [x] Fix catalog access: new users get default building/pharmacy assignment on first login
- [x] Upload transparent logo and integrate into AppLayout, SplashScreen, auth screens
- [x] Rebuild Login page: premium dark 24/7 theme, Google/Apple/email, loading/error states
- [x] Build/refine Onboarding: building/location selection, pharmacy assignment, unlock catalog
- [x] Mobile safe-area fixes: env(safe-area-inset), bottom nav overlap, Safari/Chrome mobile
- [x] TypeScript clean + 36 tests passing

## Transparent Logo Fix (v12)

- [x] Upload transparent PNG logo to static assets
- [x] Replace all logo URL references: AppLayout, SplashScreen, Login, Onboarding
- [x] Remove any rounded corners or background treatments from logo img tags
- [x] TypeScript clean + 36 tests passing
