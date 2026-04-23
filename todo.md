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
