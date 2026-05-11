import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const errors = [];

// Check 5 living docs
const livingDocs = [
  "docs/OPERATIONS.md",
  "docs/RUNTIME.md",
  "docs/COMPLIANCE.md",
  "docs/RELEASE.md",
  "docs/STATUS.md",
];

for (const doc of livingDocs) {
  if (!fs.existsSync(path.join(root, doc))) {
    errors.push(`Missing living doc: ${doc}`);
  }
}

// Check 2 ADR files
const adrFiles = [
  "docs/adr/README.md",
  "docs/adr/0001-doc-collapse.md",
];

for (const adr of adrFiles) {
  if (!fs.existsSync(path.join(root, adr))) {
    errors.push(`Missing ADR file: ${adr}`);
  }
}

// Check 2 DPDP scaffolds
const dpdpFiles = [
  "docs/dpdp/data-flow.md",
  "docs/dpdp/consent-matrix.md",
];

for (const dpdp of dpdpFiles) {
  if (!fs.existsSync(path.join(root, dpdp))) {
    errors.push(`Missing DPDP scaffold: ${dpdp}`);
  }
}

// Check root .md count is <= 8
const rootMdFiles = fs.readdirSync(root).filter(
  (f) => f.toLowerCase().endsWith(".md") && fs.statSync(path.join(root, f)).isFile()
);
const rootMdCount = rootMdFiles.length;

if (rootMdCount > 8) {
  errors.push(
    `Root .md count is ${rootMdCount} (expected <= 8). Files: ${rootMdFiles.join(", ")}`
  );
}

// Report
if (errors.length > 0) {
  console.error("docs:verify FAILED:");
  for (const err of errors) {
    console.error(`  ✗ ${err}`);
  }
  process.exit(1);
}

console.log(
  `docs:verify ok — 5 living docs + 2 ADR + 2 DPDP scaffolds present; root .md count: ${rootMdCount}`
);
process.exit(0);
