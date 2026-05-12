#!/usr/bin/env node
/**
 * Regenerates DOMAINS.md from actual drizzle/schema/*.ts files.
 * Counts `export const X = mysqlTable(...)` patterns per file.
 * Run: node scripts/regenerate-domains-md.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, basename } from "path";

const SCHEMA_DIR = join(process.cwd(), "drizzle", "schema");
const OUTPUT_FILE = join(process.cwd(), "DOMAINS.md");

// Files to skip (barrels / index)
const SKIP_FILES = new Set(["index.ts", "system.ts"]);

function extractTables(src) {
  const tableRegex = /^export const (\w+)\s*=\s*mysqlTable\s*\(/gm;
  const names = [];
  let m;
  while ((m = tableRegex.exec(src)) !== null) {
    names.push(m[1]);
  }
  return names;
}

function getFiles() {
  return readdirSync(SCHEMA_DIR)
    .filter(f => f.endsWith(".ts") && !SKIP_FILES.has(f))
    .sort();
}

const DOMAIN_META = {
  "identity.ts": {
    title: "Auth & Tenancy",
    desc: "Core authentication entities. Users can be customers or staff. Staff are scoped to a store via `staffAssignments`. OTP codes support phone-based login.",
  },
  "catalog.ts": {
    title: "Product Catalog",
    desc: "Products are global; `storeSkus` holds per-store availability and pricing. Barcodes and aliases enable multi-code scanning.",
  },
  "inventory.ts": {
    title: "Stock & Movements",
    desc: "Batch-level stock truth. All quantity changes go through `stockMovements` (append-only ledger). `batchLedger.qtyOnHand` is maintained by triggers on `stockMovements`. `stockReservations` holds soft-locks for in-flight orders.",
  },
  "orders.ts": {
    title: "Customer Orders",
    desc: "Cart-to-order lifecycle. Orders reference `orderItems` which link to `storeSkus`. SLA events track delivery timing obligations.",
  },
  "sales.ts": {
    title: "Counter Billing",
    desc: "Over-the-counter and FEFO-driven billing. `invoiceSequences` issues statutory bill numbers. `invoiceSnapshots` provides immutable PDF evidence. `shiftClosings` captures end-of-day cash reconciliation.",
  },
  "purchase.ts": {
    title: "Supplier & Purchase",
    desc: "Full procure-to-pay cycle. `h1Register` provides Schedule H/H1 statutory records. Double-entry accounting via `accountingJournalEntries`; `tallyExportRuns` tracks Tally CSV exports.",
  },
  "prescriptions.ts": {
    title: "Prescription Vault",
    desc: "Prescription lifecycle: upload → prior approval → dispense → compliance log. `prescriptionAccessLog` audits every access for DPDP compliance. `familyConsent` records guardian consent for minor patients (SM-B).",
  },
  "delivery.ts": {
    title: "Delivery & WhatsApp",
    desc: "Rider assignment, OTP-verified handoff, and WhatsApp conversational commerce channel.",
  },
  "compliance.ts": {
    title: "Audit, RBAC & DPDP",
    desc: "Immutable audit trail with SHA-256 hash chain (`auditLogChain`). DPDP consent records (`consentNoticeVersions`, `dsrRequests`). Capability-based RBAC grants. Transactional outbox for command dispatch (SM-B).",
  },
  "intelligence.ts": {
    title: "AI & OCR",
    desc: "OCR purchase invoice ingestion pipeline. AI decision ledger with human-in-the-loop review. `aiEvalLedger` records every AI suggestion with operator outcomes for continuous evaluation.",
  },
  "system_ops.ts": {
    title: "System Operations",
    desc: "Infrastructure layer: worker jobs, SLO events, reservations, stock locks, ledgers, report exports, system settings, helpdesk, printers, idempotency keys, provider webhooks/dead-letters, barcode aliases, label print jobs, discount rules, backup drill results, incident rehearsal log (split from system.ts in SM-E).",
  },
  "system_comms.ts": {
    title: "Notifications & Comms",
    desc: "Notification events and preferences. Doctor consult requests. Message templates for WhatsApp/SMS/email/app channels (split from system.ts in SM-E).",
  },
  "system_consumer.ts": {
    title: "Consumer Health Records",
    desc: "Patient-centric data: family members, medicine records, refill plans and events, dosage schedules, dose logs, order ratings, consents, medicine record access log, clinical reference data (generics, doctors, patient categories, schedule master). Split from system.ts in SM-E.",
  },
};

const files = getFiles();
let totalTables = 0;
const sections = [];

for (const file of files) {
  const src = readFileSync(join(SCHEMA_DIR, file), "utf8");
  const tables = extractTables(src);
  totalTables += tables.length;
  const meta = DOMAIN_META[file] ?? {
    title: file.replace(".ts", ""),
    desc: "",
  };
  sections.push({ file, tables, ...meta });
}

const lines = [
  "# Schema Domains",
  "",
  `Schema split: \`drizzle/schema/system.ts\` → 13 domain files in \`drizzle/schema/\`.`,
  `Barrel: \`drizzle/schema/index.ts\` re-exports from all domain files. All import paths unchanged.`,
  `**Total tables: ${totalTables}** (regenerated ${new Date().toISOString().slice(0, 10)} by scripts/regenerate-domains-md.mjs)`,
  "",
  "## Domain Files",
  "",
];

for (const { file, tables, title, desc } of sections) {
  lines.push(`### \`${file}\` — ${title} (${tables.length} tables)`);
  lines.push(`\`${tables.join("`, `")}\``);
  lines.push("");
  if (desc) {
    lines.push(desc);
    lines.push("");
  }
}

writeFileSync(OUTPUT_FILE, lines.join("\n"), "utf8");
console.log(
  `DOMAINS.md regenerated: ${totalTables} tables across ${sections.length} domain files.`
);
for (const { file, tables } of sections) {
  console.log(`  ${file}: ${tables.length} tables`);
}
