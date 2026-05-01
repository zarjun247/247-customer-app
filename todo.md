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
## Catalog Access Bug Fix — New User Flow (v13)

### Backend
- [x] Add ONBOARDING_REQUIRED constant to shared/const.ts
- [x] catalog.list: throw PRECONDITION_FAILED with ONBOARDING_REQUIRED when onboardingComplete=false or assignedStoreId missing
- [x] catalog.store: throw PRECONDITION_FAILED with ONBOARDING_REQUIRED when no assignedStoreId
- [x] cart.upsert: guard against missing assignedStoreId (throw PRECONDITION_FAILED)
- [x] orders.checkout: upgrade from plain Error to TRPCError PRECONDITION_FAILED

### Frontend — Page Guards
- [x] Create useOnboardingGuard() hook in client/src/hooks/useOnboardingGuard.ts
- [x] Apply guard to Catalog.tsx
- [x] Apply guard to Orders.tsx
- [x] Apply guard to Cart.tsx
- [x] Apply guard to RxUpload.tsx
- [x] Apply guard to Profile.tsx
- [x] Apply guard to RefillReminders.tsx

### Frontend — Differentiated Empty States in Catalog
- [x] Handle ONBOARDING_REQUIRED tRPC error → show "Complete setup" CTA
- [x] Separate loading state (skeleton/spinner)
- [x] Separate true-empty state (no items in store)
- [x] Separate network error state (retry CTA)

### Onboarding Flow
- [x] After onboarding success, invalidate user.profile cache before navigating to /catalog
- [x] Ensure building→primaryStoreId mapping works for all buildings in DB

### Tests
- [x] Add vitest: catalog.list returns ONBOARDING_REQUIRED for user with no assignedStoreId
- [x] Add vitest: catalog.list returns items for user with valid assignedStoreId
- [x] TypeScript clean + all tests passing (41/41)

## Real Location Intelligence (v14)

### Schema & Store Master
- [x] Add openingHours (JSON text), priority (int), isPrimary (bool) to stores table
- [x] Add addressLine1, addressLine2, landmark to buildings table
- [x] Add userLat, userLng, userAddress (free-text) to users table for non-building address mode
- [x] Generate and apply Drizzle migration
- [x] Seed 4 real Mumbai store locations with full data (Hiranandani, Powai, Chandivali, Kanjurmarg)
- [x] Seed real buildings with lat/lng and primaryStoreId mappings

### Server: Location Intelligence
- [x] New tRPC procedure: location.geocode (address → lat/lng via Maps proxy)
- [x] New tRPC procedure: location.autocomplete (query → place suggestions via Maps proxy)
- [x] New tRPC procedure: location.checkServiceability (lat/lng → nearest store + serviceable bool)
- [x] Update resolveStore to respect serviceRadius (reject stores where distance > serviceRadius)
- [x] Update resolveStore to use real opening hours for "open now" computation
- [x] Update catalog.store to return openNow, openingHoursText, priority

### Onboarding Flow
- [x] Replace building dropdown with Places Autocomplete address search
- [x] Add building selection as optional refinement after address search
- [x] Add serviceability check step: show assigned pharmacy or "not serviceable" message
- [x] Persist userLat, userLng, userAddress on user record
- [x] Block catalog entry if serviceability check fails

### Frontend: Real Values
- [x] AppLayout: show "Open now" / "Closed" based on real opening hours
- [x] AppLayout: show real ETA from routing engine
- [x] Profile: show full pharmacy address, opening hours, open status
- [x] Catalog header: show pharmacy name + open status

### Tests & Validation
- [x] Vitest: serviceability check returns correct store for Hiranandani coordinates
- [x] Vitest: serviceability check returns null for coordinates outside all service radii
- [x] TypeScript clean + all tests passing

## Phase 1 — Production Auth & Route Guards (v15)

- [x] Make users.openId nullable (phone users have no Manus openId)
- [x] Add getUserByPhone and upsertUserByPhone helpers to db.ts
- [x] verifyOtp procedure: upsert user by phone + create session cookie on success
- [x] Replace getLoginUrl() Manus portal redirect with /login in const.ts
- [x] Fix main.tsx global UNAUTHORIZED handler to redirect to /login
- [x] Fix Home.tsx LandingHome "Get started" to link to /login
- [x] Fix useAuth redirectPath default to /login
- [x] Add Google OAuth server route and client button (via Manus SSO, getManusSSOUrl)
- [x] Add Apple OAuth server route and client button (shows coming-soon toast; infrastructure ready)
- [x] OnboardingGuard in App.tsx: also check assignedStoreId
- [x] Verify useOnboardingGuard is applied to all 6 protected pages
- [x] Catalog: all 5 states differentiated (loading/onboarding/unavailable/error/empty)
- [x] TypeScript clean + all tests passing

## Phase 2 — Real Location Intelligence

- [x] Add pincode fallback to checkServiceability (Pass 3: nearest store in same pincode)
- [x] Add fullAddress field to stores schema (address field serves as fullAddress — no separate column needed)
- [x] Verify seed data: all 4 stores have correct lat/lng, serviceRadius, openingHours, priority, isPrimary
- [x] Wire building list query to Onboarding building tab (buildings loaded from DB via location.getBuildings)
- [x] Fix ETA text to be customer-safe: formatEtaText rounds to nearest 5 min, returns 'Arriving in ~X min'
- [x] Add traffic buffer label in ETA text when duration_in_traffic is used (handled in getDrivingEtaMins)
- [x] Add "Try a different address" CTA on non-serviceable state in Onboarding
- [x] Expose location.checkServiceability result reason to Onboarding for specific messaging
- [x] Wire real openNow/openingHoursText/etaMins into AppLayout context strip (uses server etaText)
- [x] Wire real pharmacy name/ETA into Catalog sticky header (uses server etaText)
- [x] Wire real openNow/openingHoursText into Profile pharmacy card (uses server etaText)
- [x] TypeScript clean + all tests passing — 47/47

## Phase 4 — Prescription System
- [x] Extend prescriptions table: lane, doctorName, doctorReg, prescribedDate, expiryDate, linkedProductIds, priorApprovalId, patientNote, dispensingPharmacistId, dispensedAt
- [x] Add rx_compliance_log table: rxId, orderId, pharmacistId, action, note, timestamp, fallbackMode
- [x] Add rx_prior_approvals table: rxId, approvedByPharmacistId, validUntil, linkedProductIds
- [x] Extend orders table: rxLane, rxGateCleared, rxGateClearedAt, rxGateClearedBy
- [x] Extend users role enum: add pharmacist, store_manager, inventory_operator, delivery_operator, auditor
- [x] Run migration for all Phase 4 schema changes
- [x] Server: pharmacist.workbench tRPC router
- [x] Server: rx.submit with lane detection
- [x] Server: parallel prep flow with hard Rx gate
- [x] Server: compliance log writer
- [x] Client: RxUpload page with 4-lane selector and status tracking
- [x] Client: Pharmacist Workbench page (/pharmacy/rx-queue)
- [x] Client: Customer Rx status states
- [x] Client: Prescription Vault page (/rx-vault)

## Phase 5 — Pharmacy OS
- [x] Add vendors, purchase_orders, po_items, grn_records, staff_assignments tables
- [x] Run migration for Phase 5 schema changes
- [x] Server: inventory, vendor, po, FEFO, staff routers
- [x] Client: Pharmacy OS layout with sidebar (/pharmacy/*)
- [x] Client: Inventory, GRN, FEFO, Vendor/PO, Staff pages

## Phase 6 — Bridge / Orchestrator
- [x] Add workflow_events, user_importance_scores tables
- [x] Server: order state machine, stock reservation/release
- [x] Server: refill orchestration, notification orchestration
- [x] Server: importance scoring, connector stubs

## Phase 7 — Rider Ops
- [x] Add riders, delivery_events, delivery_otps tables
- [x] Run migration for Phase 6+7 schema changes
- [x] Server: rider router, failed delivery path
- [x] Client: Rider assignment UI, customer delivery tracking

## Phase 8 — Metrics / Founder Dashboard
- [x] Add metrics_events table
- [x] Server: metrics router with all KPIs
- [x] Client: Founder dashboard page (/admin/dashboard)

## Phase 9 — Compliance / Security / RBAC
- [x] RBAC permissions matrix and middleware (pharmacistProcedure, storeManagerProcedure, adminProcedure)
- [x] Audit export endpoint
- [x] Prescription retention policy
- [x] Consent/privacy surfaces, grievance flow, compliance notes
- [x] TypeScript clean + all tests passing (Phases 4-9)

## Phase 3 — Root-Cause Bug Fix Pass

- [x] Fix useAuth: move localStorage.setItem out of useMemo into useEffect; remove manus-runtime-user-info
- [x] Fix DashboardLayout: replace window.location.href = getLoginUrl() with navigate("/login")
- [x] Fix App.tsx OnboardingGuard: handle Case A (unauthenticated → /login) explicitly
- [x] Fix useOnboardingGuard: show loading skeleton while isReady=false instead of null
- [x] Verify catalog.list/store throw ONBOARDING_REQUIRED (already done - confirm)
- [x] Verify OTP verifyOtp creates real session cookie (already done - confirm)
- [x] Verify no node/pharmacy-node language in client (already done - confirm)
- [x] TypeScript clean + all tests passing

## Full System Completion Pass (v15)

- [x] P3: Add invoiceIngestions, ocrJobs, humanReviewItems schema tables; run migration
- [x] P3: Build server/ingestion.ts (OCR hook, duplicate merge, batch creation, barcode scaffolding)
- [x] P3: Build server/routers/ingestionRouter.ts (upload, list, review, approve, reject procedures)
- [x] P3: Build client InvoiceIngestion.tsx human review console
- [x] P3: Register /ingestion route in App.tsx
- [x] P6: Build server/notifications.ts (6 customer notification templates)
- [x] P6: Build server/connectors.ts (WhatsApp/SMS, payment, printer, ERP stubs)
- [x] P6: Wire notifications into order lifecycle procedures
- [x] P9: Add helpdesk_tickets, user_consents schema tables; run migration
- [x] P9: Build server/routers/helpdeskRouter.ts (ticket create/list/resolve)
- [x] P9: Build client Helpdesk.tsx grievance/support page
- [x] P9: Build client Consent.tsx privacy/consent surface
- [x] P9: Build server/worker.ts queue worker scaffolding with retry logic
- [x] P9: Add /api/health observability endpoint and alert stubs
- [x] P9: Register helpdesk/consent routes in App.tsx
- [x] TypeScript clean + all tests passing (73/73)

## Hardening Pass (v16 — pasted_content_7.txt)
- [x] Schema: add snoozedUntil to refillReminders table
- [x] Schema: add gstRate, searchableTokens to products table
- [x] Schema: add isFeatured, sponsorPriority, sponsorCategory, sponsorLabel, sponsorValidUntil to storeSkus (sponsored shelf)
- [x] Schema: add imageAngle2Url, imageAngle3Url, imageAngle4Url, imageVideoUrl to products (multi-angle media)
- [x] Schema: run migration (15 ALTER TABLE statements applied)
- [x] Server db.ts: getSponsoredShelf helper (OTC/wellness only, never Rx, ordered by sponsorPriority)
- [x] Server db.ts: getPrescriptionVault helper (approved + on-file prescriptions)
- [x] Server db.ts: markPrescriptionOnFile helper
- [x] Server db.ts: createPriorApproval / getActivePriorApprovals helpers
- [x] Server db.ts: snoozeRefillReminder helper
- [x] Server db.ts: buildSearchableTokens / normalizeProductName catalog normalization helpers
- [x] Server routers.ts: catalog.sponsored procedure (sponsored shelf)
- [x] Server routers.ts: prescriptions.vault, prescriptions.markOnFile, prescriptions.priorApprovals procedures
- [x] Server routers.ts: refills.snooze procedure
- [x] Frontend: centralize LOGO_URL in const.ts; remove local definitions from Login, AppLayout, SplashScreen, Home, Onboarding
- [x] Frontend: safe-area utility classes (pb-safe, pt-safe, mb-safe, pb-safe-nav) in index.css
- [x] Frontend: Catalog — store-closed state with "Upload prescription for later" CTA
- [x] Frontend: Catalog — sponsored shelf horizontal strip (OTC/wellness, no Rx, no active search)
- [x] Frontend: Orders/OrderDetail — zero-padded display IDs (ORD-000123) instead of raw integer IDs
- [x] Frontend: RxUpload — 4-lane UI (upload / vault / pharmacist-assisted / prior approvals banner)
- [x] Frontend: RxUpload — additional_verification status in STATUS_CONFIG
- [x] Frontend: RxUpload — "Save to vault" CTA on approved prescriptions
- [x] Frontend: RefillReminders — snooze dropdown (1d / 3d / 7w) with optimistic update
- [x] Frontend: RefillReminders — chronic medication badge (Repeat icon + "Chronic" label)
- [x] Frontend: RefillReminders — snoozed reminders section (dimmed, shows wake-up date)
- [x] TypeScript clean (0 errors), 73/73 tests passing

## Gap-Fill Pass (v17 — pasted_content_8.txt remaining gaps)

- [x] Server db.ts: wire multi-angle image fields (imageHeroUrl, imageSideUrl, imageRearUrl, imageLabelUrl, imageNutritionUrl) into getCatalog and getSkuById
- [x] Server db.ts: add searchableTokens to catalog search WHERE conditions
- [x] Server db.ts: add getSnoozedReminders helper (reminders where snoozedUntil > now)
- [x] Server routers.ts: add refills.listSnoozed procedure
- [x] Frontend RefillReminders.tsx: use refills.listSnoozed endpoint instead of client-side filter
- [x] Frontend Catalog.tsx: add ProductDetailModal with multi-angle image gallery (dot indicators, prev/next arrows, GST display, generic name note)
- [x] Frontend Catalog.tsx: wire onDetail prop into ProductCard — card click opens modal; Add/Remove buttons stop propagation
- [x] TypeScript clean (0 errors), 73/73 tests passing

## Doctor Consult Lane + Continuity Pass (v18 — pasted_content_9.txt)

- [x] Schema: add "doctor_consult" to prescriptions.lane enum
- [x] Schema: add "doctor_consult" to orders.rxLane enum
- [x] Schema: add doctor_consult_requests table (userId, consultType, status, assignedDoctorName, consultNote, linkedPrescriptionId, requestedAt, completedAt)
- [x] Schema: run migration (3 SQL statements applied)
- [x] Server db.ts: createConsultRequest, getConsultRequests, linkConsultPrescription helpers
- [x] Server routers.ts: consultRouter with consult.request, consult.list, consult.linkPrescription procedures
- [x] Frontend RxUpload.tsx: add 5th lane "Talk to a doctor" (Stethoscope icon, navigates to /doctor-consult)
- [x] Frontend DoctorConsult.tsx: new page with 3-step flow (type → complaint → review/consent → done), active consult tracker, past consult history with doctor's note display, medical disclaimer, consent checkbox
- [x] Frontend App.tsx: register /doctor-consult route (ProtectedRoute)
- [x] Frontend Home.tsx: add active consult banner (blue, tappable, navigates to /doctor-consult) in continuity hooks section
- [x] TypeScript clean (0 errors), 73/73 tests passing

## Final Polish Pass (v19 — pasted_content_10.txt)

- [x] Catalog: add storeError service-unavailable state (server error guard before store-closed)
- [x] Catalog: add OTC / Chronic / Medical Device / Nutrition product card flags (colour-coded badges)
- [x] Catalog: add "Don't have a prescription?" consult shortcut on Rx product card tap
- [x] Profile: fix raw buildingId fallback — show "Not set" instead of "Building {id}"
- [x] RxUpload: add "Don't have a prescription? Talk to a doctor" ghost button below upload lane
- [x] Home: add "Don't have a prescription? Talk to a doctor" tertiary CTA in empty state
- [x] TypeScript clean (0 errors), 73/73 tests passing

## 10/10 Final Polish Pass (v20 — pasted_content_11.txt)

- [x] Catalog: replace "Ad" badge with editorial "Featured" label on sponsored shelf cards
- [x] Catalog: upgrade sponsored shelf header to brand-block editorial feel (not ad-like)
- [x] Catalog: add "Personal care" product flag for personal_care category
- [x] Catalog: improve out-of-stock language ("Currently unavailable" not just label)
- [x] Catalog: tighten product card spacing and flag visual hierarchy
- [x] RxUpload: elevate lane cards to premium feel (larger icons, better spacing, clearer sub-copy)
- [x] RxUpload: improve Rx status visual hierarchy (status badge + sub-copy + next-step hint)
- [x] RxUpload: make "Don't have a prescription?" path feel guided and compliant, not shortcut-ish
- [x] Home: tighten continuity card styling and empty state first-run impression
- [x] Home: improve "Talk to a doctor" CTA prominence in empty state
- [x] DoctorConsult: make compliance disclaimer more prominent and reassuring
- [x] RefillReminders: improve chronic/snooze visual hierarchy
- [x] Global: tighten index.css spacing rhythm tokens
- [x] Global: fix any remaining raw-ID or node-language leaks
- [x] TypeScript clean (0 errors), all tests passing

## Upgrade to 10/10 Pass (v21 — gap closure)

### P1 — Revenue + Operations blockers
- [x] Schema: add sla_events, ai_decisions, product_barcodes tables; run migration
- [x] Razorpay: payment order creation on checkout, webhook for payment confirmation, order state advances to paid
- [x] Razorpay: payment status shown in OrderDetail and Orders list
- [x] SMS notifications: wire MSG91 into server/connectors.ts (replace stub with real HTTP call)
- [x] SMS notifications: trigger on order created, pharmacist approved, out_for_delivery, delivered
- [x] SLA breach engine: sla_events written on order creation + state transitions, breach flag computed
- [x] Command center: SLA board tab showing active orders with SLA remaining + breach alerts

### P2 — Pharmacy OS completeness
- [x] Expiry dashboard: /pharmacy/expiry page with warning/critical/quarantine/expired zones from batches
- [x] Medivision CSV sync: /api/integrations/medivision/import-stock endpoint (CSV parse → batch upsert)
- [x] Medivision sync health heartbeat: last sync time + row counts in command center
- [x] GST/Tally export: /api/exports/gst CSV endpoint (order lines + HSN + GST breakdown)
- [x] GST export UI: button in admin dashboard to download GST report for date range

### P3 — Operational completeness
- [x] Barcode print service: Code 128 label generation for internal batches
- [x] Barcode print queue: /pharmacy/barcodes page (pending labels, print action)
- [x] TypeScript clean (0 errors), all tests passing

## Full Pharmacy OS Upgrade (v22 — pasted_content_12.txt)

### P0 — Stabilise
- [x] Extend user.role enum: cashier, salesman, purchase_manager, accountant, super_admin
- [x] staffProcedure / pharmacistProcedure / managerProcedure RBAC guards
- [x] Lock order mutations: customers view own orders only; staff advance operational statuses
- [x] audit_logs table + writeAuditLog on all sensitive mutations
- [x] Harden stock reservation: atomic checkout + release on cancel/timeout

### P1 — Master Data
- [x] Schema: suppliers, manufacturers, generics, doctors, patient_categories, schedules, discount_categories, message_templates, printers, financial_years, states, product_aliases, product_supplier_mappings, product_locks, stock_movements, stock_adjustments
- [x] Master Data admin section in PharmacyOS with CRUD for each master
- [x] CSV import/export on each master

### P2+P3 — Inventory + Purchase
- [x] Schema: purchase_invoices, purchase_lines, purchase_returns, supplier_payments
- [x] Purchase entry form (supplier, invoice, line items, batch, MRP, GST, stock commit)
- [x] Stock movements ledger page
- [x] Batchwise balance page with FEFO + expiry zones

### P4+P5 — OCR Ingestion + Counter Billing
- [x] Schema: ingestion_jobs, ingestion_files, ocr_extracted_headers, ocr_extracted_lines, ocr_match_candidates, sku_creation_drafts, purchase_drafts, purchase_draft_lines
- [x] OCR upload → invokeLLM extraction → draft purchase → human review → commit
- [x] Counter billing / POS screen: barcode scan, FEFO batch, payment, print bill

### P6+P7 — Prescription Governance + Customer Medicine Record
- [x] H1 register table + H1 report generation
- [x] Repeat-dispense validation
- [x] Customer medicine record page (full purchase + Rx history per patient)
- [x] Family member mapping on customer profile

### P8 — Reports Engine
- [x] Reports section: daily sale, daily purchase, GST summary, HSN-wise, stock valuation, H1 report, SLA report
- [x] CSV + PDF export for each report category

### P9 — Accounting + Tally + Shift Closing
- [x] Schema: ledgers, ledger_entries, shift_closings
- [x] Shift closing form (opening cash, sales, UPI, expenses, variance, manager approval)
- [x] Tally-compatible CSV/XML export (sales voucher, purchase voucher, receipt/payment)

### P10 — System Admin Utilities
- [x] System health dashboard (OCR queue, WhatsApp webhook, Medivision sync, DB check)
- [x] Transaction locking (daily shift lock, monthly lock, GST filing lock)
- [x] Financial year management

## Full Pharmacy OS Upgrade — v22 (Apr 29 2026)

- [x] P0: Extend user.role enum — cashier, salesman, purchase_manager, accountant, super_admin, store_manager, inventory_operator, delivery_operator, auditor
- [x] P0: audit_logs table added to schema
- [x] P1: 34 new master data tables — suppliers, manufacturers, generics, doctors, patient_categories, schedules, discount_categories, message_templates, printers, financial_years, states, product_aliases, product_supplier_mappings, product_locks, stock_movements, stock_adjustments, purchase_invoices, purchase_lines, purchase_returns, supplier_payments, ocr_ingestion_jobs, ocr_extracted_headers, ocr_extracted_lines, ocr_match_candidates, sku_creation_drafts, purchase_drafts, purchase_draft_lines, ledgers, ledger_entries, shift_closings, system_settings, transaction_locks, h1_register, customer_medicine_records
- [x] P1: masterDataRouter — CRUD for suppliers, manufacturers, generics, doctors, schedules, discount_categories, message_templates, printers
- [x] P1: MasterData.tsx page — tabbed CRUD UI for all master data
- [x] P2: purchaseRouter — create/list/get invoice, add line, commit invoice (stock update + batch creation)
- [x] P2: PurchaseEntry.tsx page — invoice list, create form, line item entry, commit action
- [x] P3: ocrIngestionRouter — listJobs, getJob, reviewLine procedures
- [x] P3: OcrIngestion.tsx page — upload zone, job list, line review with approve/reject
- [x] P4: reportsRouter — dailySale, dailyPurchase, gstSummary, stockValuation, nearExpiry, slaPerformance, h1Register, nonMoving, shiftClosings, submitShiftClosing
- [x] P4: Reports.tsx page — 6 report tabs with CSV export, date range filter
- [x] P5: ShiftClosing.tsx page — shift form with variance preview, submit for approval
- [x] P6: PharmacyOS quick-access strip extended — 10 tool buttons (Expiry, SLA, Barcode, GST, Medivision, Purchase, OCR, Reports, Master Data, Shift)
- [x] P6: App.tsx — 5 new routes registered (/pharmacy/purchase, /pharmacy/ocr, /pharmacy/reports, /pharmacy/master-data, /pharmacy/shift)
- [x] TypeScript 0 errors, 73/73 tests passing

## v23 — Full Pharmacy OS Hardening (Apr 29 2026)

### Critical Fixes
- [x] OTP auth: verifyOtp creates session cookie, auth.me works after OTP login, no dev OTP in production
- [x] RBAC: requireRole / requireAnyRole / requireOrderOwnershipOrStaff / requirePrescriptionOwnershipOrStaff guards
- [x] Order state machine: 16 explicit states, role-enforced transitions, reason required, audit log before/after
- [x] Prescription enforcement: Rx/H/H1/X checkout gate, prescriptionId required, pharmacist approval before picking
- [x] Inventory safety: transactional stock reservation, FEFO batch assignment, release on cancel, decrement on delivery
- [x] WhatsApp: link phone to customer ID, ownership check, no userId=0 prescriptions

### Admin Area
- [x] /admin layout with real sidebar (20+ routes)
- [x] /admin/masters/suppliers — CRUD
- [x] /admin/masters/manufacturers — CRUD
- [x] /admin/masters/categories — CRUD
- [x] /admin/masters/generics — CRUD
- [x] /admin/masters/schedules — CRUD
- [x] /admin/masters/discounts — CRUD
- [x] /admin/masters/doctors — CRUD
- [x] /admin/masters/customers — CRUD
- [x] /admin/masters/staff — CRUD
- [x] /admin/masters/buildings — CRUD
- [x] /admin/masters/stores — CRUD

### Product/Batch + Prescription Governance
- [x] Product master upgrade: schedule_id, barcodes, supplier aliases, product_locks
- [x] Batch registry: purchase_rate, sale_rate, landing_cost, margin, qty_reserved, qty_quarantined
- [x] /admin/prescriptions: pending queue, image viewer, approve/reject/clarify, line-item approval

### Purchase + OCR + Counter Billing
- [x] /admin/purchase + /admin/purchase/new: full invoice entry, stock commit
- [x] /admin/ocr: upload → AI extract → review → commit
- [x] /admin/sales/counter: barcode scan, FEFO batch, payment, print bill, sale return

### Command Center + Reports + Accounting + Utilities
- [x] /admin/command-center: live orders, pending reviews, SLA breach, stockouts, WhatsApp queue
- [x] /admin/reports/daily-sales, stock, expiry, purchase, h1, gst
- [x] /admin/accounting: ledger, payment/receipt entry, Tally export placeholder
- [x] /admin/utilities: printer setup, batch management, transaction lock, DB health

## PART 2 — Master Data Part A (v25)

- [x] Schema: add categories table (parentCategoryId, marginPolicy), add state varchar to suppliers
- [x] masterDataRouter: supplierRouter — add deactivate + exportCsv + state field
- [x] masterDataRouter: manufacturerRouter — add deactivate + exportCsv
- [x] masterDataRouter: categoryRouter — create from scratch (list/create/update/deactivate/exportCsv)
- [x] masterDataRouter: genericRouter — add deactivate + exportCsv
- [x] masterDataRouter: scheduleRouter — add create/update/deactivate procedures
- [x] masterDataRouter: discountCategoryRouter — add create/update/deactivate/exportCsv
- [x] All mutations: write proper writeAuditLog calls (entityType, before, after, reason)
- [x] Frontend: /admin/masters index hub page
- [x] Frontend: /admin/masters/suppliers — full CRUD table with search, modal, deactivate, CSV export
- [x] Frontend: /admin/masters/manufacturers — full CRUD table
- [x] Frontend: /admin/masters/categories — full CRUD table with parent selector
- [x] Frontend: /admin/masters/generics — full CRUD table
- [x] Frontend: /admin/masters/schedules — full CRUD table with boolean toggles
- [x] Frontend: /admin/masters/discount-categories — full CRUD table
- [x] AdminLayout sidebar: expand Masters section with 6 sub-links
- [x] App.tsx: register all 7 new /admin/masters/* routes
- [x] TypeScript 0 errors, 73/73 tests passing

## PART 3 — Master Data Part B + Upgraded Product Master

- [x] Schema: add staff_master, product_barcodes, product_margin_rules tables; upgrade products, buildings, stores, doctors, printers with new fields
- [x] Migration 0017 generated and applied to DB (3 new tables)
- [x] masterDataPart3Router.ts: doctorMasterRouter (list/create/update/deactivate/reactivate/exportCsv + audit log)
- [x] masterDataPart3Router.ts: patientCategoryRouter (list/create/update/deactivate/reactivate + audit log)
- [x] masterDataPart3Router.ts: staffMasterRouter (list/create/update/deactivate/reactivate/exportCsv + audit log)
- [x] masterDataPart3Router.ts: storeMasterRouter (list/create/update/deactivate/reactivate/exportCsv + audit log)
- [x] masterDataPart3Router.ts: buildingMasterRouter (list/create/update/exportCsv + audit log)
- [x] masterDataPart3Router.ts: printerMasterRouter (list/upsert/deactivate/reactivate + audit log)
- [x] masterDataPart3Router.ts: productMasterRouter (list/create/update/deactivate/exportCsv + audit log)
- [x] All Part 3 routers registered in masterDataRouter.ts
- [x] Frontend: /admin/masters/doctors — full CRUD table with search, deactivate, reactivate, CSV export
- [x] Frontend: /admin/masters/patient-categories — full CRUD table
- [x] Frontend: /admin/masters/staff — full CRUD table with role filter, login toggle, CSV export
- [x] Frontend: /admin/masters/stores — full CRUD table with SLA/radius/coordinates fields
- [x] Frontend: /admin/masters/buildings — full CRUD table with coordinates and store mapping
- [x] Frontend: /admin/masters/printers — full CRUD table with printer type badges
- [x] Frontend: /admin/masters/products — paginated CRUD table with tabbed create/edit dialog (Basic/Compliance/Catalog), schedule badges, CSV export
- [x] App.tsx: registered all 7 new /admin/masters/* routes
- [x] AdminLayout: added Patient Categories and Printers to Masters sidebar section
- [x] TypeScript 0 errors

## PART 4 — Batchwise Inventory + Stock Ledger

- [x] Schema: upgrade batches table with 20+ new fields (mfgDate, purchaseRate, saleRate, schemeDiscount, cashDiscount, landingCost, margin, qtyQuarantined, qtyExpired, internalBarcode, manufacturerBarcode, storageCondition, coldChainFlag, expiryBucket, status)
- [x] Schema: add batch_ledger table (per-batch movement log)
- [x] Schema: add stock_reservations table
- [x] Schema: add stock_transfers table
- [x] Schema: add stock_audits + stock_audit_lines tables
- [x] Schema: add batch_quarantine_logs table
- [x] Schema: add expiry_actions table
- [x] Migration 0018 applied (7 new tables)
- [x] inventoryRouter: batch.list with FEFO sort, expiry bucket filter, status filter
- [x] inventoryRouter: batch.create (GRN inward with expiryBucket calculation)
- [x] inventoryRouter: batch.quarantine (quarantine qty with reason + audit log)
- [x] inventoryRouter: batch.dispose (write-off with audit log)
- [x] inventoryRouter: stock.currentStock (aggregated per product/store)
- [x] inventoryRouter: stock.nearExpiry (bucketed expiry view)
- [x] inventoryRouter: stock.movements (paginated ledger with type filter)
- [x] inventoryRouter: adjustment.list/create/approve/reject (manager approval workflow)
- [x] inventoryRouter: audit.list/create/getLines/submitCount/complete (full audit session)
- [x] Frontend: /admin/inventory/current-stock — aggregated stock per product/store
- [x] Frontend: /admin/inventory/batchwise — per-batch balance with quarantine/dispose actions
- [x] Frontend: /admin/inventory/near-expiry — bucket summary cards + filterable table
- [x] Frontend: /admin/inventory/movements — immutable ledger with type/store filter
- [x] Frontend: /admin/inventory/adjustments — create/approve/reject adjustment workflow
- [x] Frontend: /admin/inventory/audit — create session, count lines, complete with corrections
- [x] AdminLayout sidebar: expanded Inventory section with 6 sub-links
- [x] App.tsx: registered all 6 new /admin/inventory/* routes
- [x] Fixed duplicate stockMovements/stockAdjustments exports in schema.ts
- [x] TypeScript 0 errors, 73/73 tests passing

## PART 5 — Purchase Module

- [x] Schema: ALTER TABLE purchase_invoices — add sourceType, rawFileRef, gstSummary (text), approvedBy
- [x] Schema: ALTER TABLE purchase_lines — add rawLineText, confidence, reviewerId
- [x] Schema: ALTER TABLE supplier_payments — add purchaseInvoiceId, voucherNo, bankRef
- [x] purchaseRouter: updateInvoice, cancelInvoice procedures
- [x] purchaseRouter: updateLine, deleteLine procedures
- [x] purchaseRouter: GST summary auto-calculation on commitInvoice (per-rate breakdown)
- [x] purchaseRouter: enhanced commitInvoice — creates batch_ledger entries + stock_movements (purchase_inward) + updates qtyOnHand
- [x] purchaseRouter: createReturn, addReturnLine, commitReturn, listReturns, getReturn procedures
- [x] purchaseRouter: reports sub-router — register, supplierWise, productWise, batchwiseReport
- [x] Frontend: /admin/purchase/invoices — invoice list, create, detail, add/edit/delete lines, commit, cancel
- [x] Frontend: /admin/purchase/returns — return list, create, add lines, commit return
- [x] Frontend: /admin/purchase/payments — supplier payment list, record payment (cheque/UPI/NEFT/cash/RTGS)
- [x] Frontend: /admin/purchase/reports — purchase register, supplier-wise, product-wise, batchwise with CSV export
- [x] AdminLayout: Purchase section expanded with 4 sub-links + OCR
- [x] App.tsx: 5 new /admin/purchase/* routes registered
- [x] TypeScript 0 errors, 73/73 tests passing

## PART 6 — AI OCR Bill Ingestion V1

- [x] Schema: add ingestion_files table (fileUrl, fileKey, filename, mimeType, fileSizeBytes, uploadedBy)
- [x] Schema: add ocr_match_candidates table (ocrLineId, productId, matchScore, matchMethod, matchDetails, isSelected)
- [x] Schema: add ocr_review_tasks table (ingestionJobId, taskType, priority, status, assignedTo, resolvedBy)
- [x] Schema: add ai_decisions table (ingestionJobId, ocrLineId, decisionType, inputData, outputData, model, confidence)
- [x] Schema: ALTER TABLE ocr_extracted_headers — add supplierGstin
- [x] Schema: ALTER TABLE ocr_extracted_lines — add strength, dosageForm
- [x] Schema: ALTER TABLE purchase_draft_lines — add saleRate, landingCost
- [x] Schema: ALTER TABLE sku_creation_drafts — add scheduleFlag, coldChainFlag
- [x] ocrIngestionRouter: uploadBill — create ingestion_job + ingestion_file, audit log
- [x] ocrIngestionRouter: processJob — mock OCR parser (CSV + image mock) + LLM OCR path (invokeLLM with image_url)
- [x] ocrIngestionRouter: product matching engine — exact name, fuzzy name, HSN+GST (3 methods, confidence-scored)
- [x] ocrIngestionRouter: confidence rules — >=95 auto_matched, 70-95 review_required, <70 unknown_sku, H/H1/X always review
- [x] ocrIngestionRouter: listJobs, getJob, getLines, reviewLine (approve/reject/reassign/edit)
- [x] ocrIngestionRouter: generateDraft — creates purchase_draft + purchase_draft_lines from matched lines
- [x] ocrIngestionRouter: listDrafts, getDraft, approveDraft, rejectDraft, commitDraft (creates purchase_invoice)
- [x] ocrIngestionRouter: listSkuDrafts, reviewSkuDraft (approve/reject unknown SKU creation requests)
- [x] Frontend: AdminOcr.tsx — 4-tab page (Upload, Jobs, SKU Queue, Drafts)
- [x] Frontend: Upload panel — drag-drop file, CSV paste import, source type shells (email/WhatsApp/folder/legacy)
- [x] Frontend: Job list — status filter (all/ocr_complete/under_review/committed/failed), refresh
- [x] Frontend: Line reviewer — confidence badges, approve/reject/edit per line, candidate reassignment, generate draft CTA
- [x] Frontend: EditLineDialog — manual field correction for any extracted line
- [x] Frontend: SKU draft queue — approve/reject unknown SKU creation requests
- [x] Frontend: Draft approval — line detail view, approve, commit to purchase invoice
- [x] App.tsx: /admin/ocr route updated to AdminOcr
- [x] AdminLayout sidebar: OCR Ingestion link already present at /admin/ocr
- [x] TypeScript: 0 errors, 73/73 tests passing

## PART 7 — Sales + Counter Billing V1

- [x] Schema: sales table (id/billNo/saleType/storeId/customerId/customerMobile/customerName/salesmanCode/pharmacistCode/pharmacistName/pharmacistRegNo/prescriptionId/subtotal/discountAmount/gstAmount/total/gstSummary/paymentMode/paymentRef/status/billPrinted/whatsappSent/emailSent/notes/createdBy/confirmedAt/createdAt/updatedAt)
- [x] Schema: sale_lines table (id/saleId/productId/variantId/batchLedgerId/batchNo/expiryDate/productName/strength/packSize/scheduleCode/requiresPrescription/mrp/saleRate/qty/discountPct/discountAmount/gstRate/gstAmount/lineTotal/createdAt)
- [x] Schema: sale_returns table (id/returnNo/saleId/storeId/reason/refundMode/refundRef/refundAmount/status/createdBy/reviewedBy/createdAt/updatedAt)
- [x] Schema: sale_return_lines table (id/returnId/saleLineId/productId/batchLedgerId/batchNo/returnQty/unitPrice/gstRate/gstAmount/lineTotal/stockDisposition/createdAt)
- [x] Schema: counter_payments table (id/saleId/paymentMode/amount/paymentRef/receivedBy/createdAt)
- [x] salesRouter: searchProducts (barcode/name/brand/strength, returns scheduleId/prescriptionRequired/h1RegisterRequired)
- [x] salesRouter: getFEFOBatches (FEFO-ordered, excludes expired/quarantine, shows daysToExpiry/expiryBucket)
- [x] salesRouter: createDraft (creates sale in draft status, generates billNo)
- [x] salesRouter: addLine (adds product line to draft, validates Rx gate, calculates GST)
- [x] salesRouter: updateLine (update qty/discount on existing line)
- [x] salesRouter: removeLine (remove line from draft)
- [x] salesRouter: confirmSale (decrements batch_ledger.qtyOnHand, creates stock_movement sale_fulfilment, creates counter_payment, sets status=confirmed, audit log)
- [x] salesRouter: createReturn (creates sale_return + return_lines, re-enters stock per disposition, audit log)
- [x] salesRouter: listSales (paginated, filter by status/search)
- [x] salesRouter: getDraft (sale + lines with product names)
- [x] salesRouter: listReturns (paginated)
- [x] salesRouter: reports (daily/supplier/product/batchwise sub-router)
- [x] Frontend: /admin/sales/counter — AdminCounterBilling.tsx with barcode scan input, product search dropdown, FEFO batch selection with expiry bucket badges, Rx gate alert, discount field, payment mode selector, bill print (window.print), next sale button
- [x] Frontend: /admin/sales — AdminSales.tsx with paginated sale list, status filter, sale detail dialog (lines/GST/payment), create return dialog (item selection/qty/disposition/refund mode)
- [x] App.tsx: /admin/sales and /admin/sales/counter routes registered (replaced old CounterSale stub)
- [x] AdminLayout: Sales section updated with All Sales + Counter Billing + Sale Returns links
- [x] TypeScript: 0 errors, 73/73 tests passing

## PART 8 — Prescription Governance

- [x] Schema: add patientName, patientPhone, patientAddress, clarificationNote, clarificationRequestedAt, repeatDispenseCount, repeatDispenseMax to prescriptions table
- [x] Schema: create prescription_lines table (lineNo, drugName, genericName, strength, dosageForm, qty, duration, frequency, instructions, scheduleCode, requiresH1, linkedProductId, linkedBatchNo, status, pharmacistNote, reviewedBy, reviewedAt)
- [x] Schema: create prescription_access_log table (prescriptionId, accessedBy, accessType, purpose, ipAddress, createdAt)
- [x] Schema: add saleId, prescriptionLineId to h1_register table
- [x] DB: ALTER TABLE applied for all new columns and tables in live database
- [x] prescriptionGovRouter: queue (paginated, filterable by status/store/search, access log on view)
- [x] prescriptionGovRouter: get (single prescription with lines + auto-log access)
- [x] prescriptionGovRouter: updateMetadata (patient/doctor details, repeatDispenseMax, audit log)
- [x] prescriptionGovRouter: upsertLine (add/edit prescription line items, requiresH1 flag)
- [x] prescriptionGovRouter: approveLine (pharmacist approves individual line, links product/batch)
- [x] prescriptionGovRouter: rejectLine (pharmacist rejects individual line with reason)
- [x] prescriptionGovRouter: review (approve/reject entire prescription with pharmacist note, pharmacistId, reviewedAt)
- [x] prescriptionGovRouter: requestClarification (send clarification note, log timestamp)
- [x] prescriptionGovRouter: h1Register (list/create H1 register entries with patient/prescriber/drug/batch/bill/pharmacist)
- [x] prescriptionGovRouter: accessLog (paginated access log for audit trail)
- [x] prescriptionGovRouter: archive (approved/rejected/on-file prescriptions, date range filter)
- [x] prescriptionGovRouter: checkRxClearance (called by counter billing — H1/X require prescriptionId, Rx/H allow pharmacist override, logs api_check access)
- [x] prescriptionGovRouter registered as prescriptionGov in server/routers.ts
- [x] Hard Rx gate verified in salesRouter (blocks addLine for H/H1/X/Rx/NRX without rxCleared)
- [x] Hard Rx gate verified in checkout (routers.ts blocks order commit without approved prescriptionId for Rx items)
- [x] Frontend: AdminPrescriptionGov.tsx — 5-tab page (Queue, Viewer+Line Approval, H1 Register, Archive, Access Log)
- [x] App.tsx: /admin/prescriptions route updated to AdminPrescriptionGov
- [x] TypeScript: 0 errors, 73/73 tests passing

## PART 9 — Customer Medicine Records + Refill Continuity

- [x] Schema: create family_members table (userId, name, relation, dateOfBirth, gender, phone, patientCategoryId, chronicConditions JSON, allergies JSON, bloodGroup, active)
- [x] Schema: create customer_medicine_records table (userId, familyMemberId, productId, batchId, orderId, saleId, prescriptionId, purchaseType enum, qty, purchaseDate, doctorName, doctorReg, isNewMedicine, isChronicFlag, discontinued, discontinuedReason, discontinuedAt, pharmacistNote)
- [x] Schema: create refill_plans table (userId, familyMemberId, productId, prescriptionId, frequencyDays, qty, startDate, endDate, nextDueDate, lastFulfilledDate, status enum, reminderDaysBefore, whatsappReminder, appReminder, needsFreshRx, prescriptionExpiryDate, createdBy)
- [x] Schema: create refill_events table (refillPlanId, userId, eventType enum, dueDate, orderId, saleId, reminderSentAt, reminderChannel)
- [x] Schema: create customer_consents table (userId, consentType enum, granted, grantedAt, revokedAt, consentVersion, ipAddress, userAgent)
- [x] Schema: create medicine_record_access_log table (targetUserId, accessedBy, accessType enum, purpose, ipAddress)
- [x] DB: All 6 tables applied to live TiDB database
- [x] customerMedicineRouter: family CRUD (list, create, update, deactivate) — scoped to ctx.user.id
- [x] customerMedicineRouter: medicineRecord (list with pagination, create, discontinue, hasBoughtBefore)
- [x] customerMedicineRouter: refillPlan (list, create, update, markFulfilled, events, dashboard with due/missed buckets)
- [x] customerMedicineRouter: consent (list, upsert — 9 consent types)
- [x] customerMedicineRouter: admin (list customers, getProfile with medicine history + plans + family + consents, accessLog, refillDashboard with 3 views)
- [x] HIPAA-style access logging: every admin view of customer medicine records is logged to medicine_record_access_log
- [x] customerMedicineRouter registered as customerMedicine in server/routers.ts
- [x] Frontend: AdminCustomers.tsx (pages/customers/) — customer list + profile dialog with 5 tabs (Medicines, Refill Plans, Family, Consents, Access Log)
- [x] Frontend: AdminCustomers refill dashboard — due this week / missed / needs fresh Rx views
- [x] Frontend: FamilyProfiles.tsx — customer-facing family member management with add/edit/remove dialogs
- [x] Frontend: RefillCalendar.tsx — customer-facing refill tracking (due soon, missed, all plans tabs) with pause/resume
- [x] Frontend: MyMedicines.tsx — medicine history (active/discontinued toggle) + monthly chronic pack view
- [x] Routes: /family, /refill-calendar, /my-medicines (customer app), /admin/customers/medicine-records (admin)
- [x] AdminLayout sidebar: Medicine Records link added under Customers & Patients section
- [x] Trust messaging: "Rx medicines are pharmacist-reviewed" displayed on all customer-facing pages
- [x] TypeScript: 0 errors, 73/73 tests passing

## PART 10 — WhatsApp Full Channel

- [x] Schema: whatsappLinks (phone↔userId, verification method, OTP support)
- [x] Schema: whatsappMessages (full audit log — inbound/outbound, flow, state, media)
- [x] Schema: whatsappCarts + whatsappCartLines (draft orders, requiresPrescription flag)
- [x] Schema: staffHandoffs (reason, priority, assignedTo, resolutionNote)
- [x] Schema: wabaMessageTemplates (WABA-approved templates, paramCount, wabaStatus lifecycle)
- [x] DB: All 7 tables applied to live TiDB database via migration script
- [x] whatsappRouter.ts: phone linking (create/remove/list/verify OTP)
- [x] whatsappRouter.ts: webhook handler — full state machine (menu, search, status, rx_upload, reorder, handoff, delivery_exception, supplier_bill)
- [x] whatsappRouter.ts: catalogue search from real products (getCatalog integration)
- [x] whatsappRouter.ts: cart/order draft (add/remove/view/confirm → real order via createOrder, sourceChannel=whatsapp)
- [x] whatsappRouter.ts: Rx upload attaches to linked customer — never userId 0 (createWhatsappPrescription)
- [x] whatsappRouter.ts: reorder from history (getOrderItemsForReorder, rebuild cart, confirm)
- [x] whatsappRouter.ts: refill reminder CTA (list upcoming refill plans)
- [x] whatsappRouter.ts: live order status (getOrderById)
- [x] whatsappRouter.ts: bill sharing placeholder (message template trigger)
- [x] whatsappRouter.ts: staff handoff queue (create/assign/resolve/list)
- [x] whatsappRouter.ts: delivery exception handling (dedicated flow)
- [x] whatsappRouter.ts: supplier bill import via WhatsApp (OCR ingestion job creation)
- [x] whatsappRouter.ts: message templates CRUD + seed (10 default templates seeded)
- [x] whatsappRouter.ts: webhook validation helper (HMAC-SHA256 signature check)
- [x] whatsappRouter.ts: message audit logs (every inbound/outbound logged to whatsappMessages)
- [x] whatsappRouter.ts: admin stats, sessions, recent WA orders
- [x] whatsappFull router registered in server/routers.ts
- [x] AdminWhatsApp.tsx rebuilt as full 6-tab page (Overview, Messages, Linked Customers, Handoffs, Templates, Sessions)
- [x] App.tsx updated to import new AdminWhatsApp from pages/admin/AdminWhatsApp
- [x] AdminLayout sidebar already had WhatsApp entry — confirmed pointing to /admin/whatsapp
- [x] TypeScript: 0 errors, Tests: 73/73 passing

## PART 11 — Building-First Routing, SLA, Rider Module
- [x] Schema: routingDecisions, deliveryTasks, riderLocations, orderTimestamps, deliveryEvents, storeCapabilities (upgraded), deliveryOtps — all applied to live DB
- [x] routingEngine.ts: 12-step building-first node resolver (building→primary store→licence→service→pharmacist→stock→batch→cold-chain→controlled-drug→rider-capacity→ETA→fallback→pincode), allocation decision logged to routing_decisions
- [x] deliveryRouter.ts: routing.resolveNode, routing.decisions, routing.getStoreCapabilities, routing.upsertStoreCapabilities
- [x] deliveryRouter.ts: rider.list, rider.create, rider.update, rider.locationHeartbeat, rider.locationHistory
- [x] deliveryRouter.ts: task.assign, task.confirmPickup, task.outForDelivery, task.deliverWithOtp (OTP verified), task.deliverWithPhoto (photo POD), task.recordFailed (6 failure reasons), task.recordReturned, task.collectCod, task.reconcileCod, task.list, task.get, task.stats
- [x] deliveryRouter.ts: sla.list, sla.checkBreaches (scans for overdue SLA events); timestamps.list (full order lifecycle)
- [x] deliveryRouter registered in server/routers.ts
- [x] AdminDelivery.tsx: 6-tab dashboard (Overview with stats+breach alerts, Delivery Tasks with status filter+COD reconcile, Riders with add/status update, Routing Decisions with step-by-step dialog, SLA Events with breach scan, Store Capabilities CRUD)
- [x] Route /admin/delivery registered in App.tsx
- [x] AdminLayout sidebar updated with Delivery Dashboard link under Operations
- [x] TypeScript: 0 errors, Tests: 73/73 passing

## PART 12 — Command Center + Event Bus
- [x] Schema: system_events table (event_type, payload, severity, source, actorId, orderId, storeId, customerId, acknowledged) — migrated to live DB
- [x] eventBus.ts: 25 typed event types (order_placed, rx_uploaded, rx_approved, rx_rejected, stock_reserved, picking_started, packed, rider_assigned, delivered, delivery_failed, refill_due, payment_received, payment_failed, purchase_committed, stock_adjusted, batch_quarantined, manual_override, sla_breach_risk, sync_stale, ocr_pending, sla_breached, stockout_alert, near_expiry_alert, reorder_conversion, refill_missed), DB persistence, in-process subscriber hooks, emit/subscribe/unsubscribe API
- [x] commandCenterRouter.ts: snapshot (21 cards in one parallel Promise.all), slaDashboard, expiryDashboard, refillDashboard, syncComplianceDashboard, recentEvents, acknowledgeEvent
- [x] commandCenterRouter registered in server/routers.ts
- [x] AdminCommandCenter.tsx: 21 live cards with 3-level severity colouring (ok/warn/critical), 4 sub-dashboard tabs (SLA, Expiry, Refill, Sync/Compliance), auto-refresh every 30s, critical events banner, building demand heatmap, store performance table, node capacity grid, order status breakdown
- [x] Route /admin/command-center updated to new PART 12 page in App.tsx
- [x] Command Center already in AdminLayout sidebar under /admin/command-center
- [x] TypeScript: 0 errors, Tests: 73/73 passing
