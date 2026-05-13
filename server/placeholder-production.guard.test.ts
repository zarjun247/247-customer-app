import { describe, it, expect } from "vitest";
import fs from "fs";

const sourceFiles = [
  "server",
  "drizzle",
  "RELEASE_CHECKPOINT.md",
  "PRODUCTION_READINESS_STATUS.md",
  "SECURITY_LOCKDOWN_STATUS.md",
  "PRODUCTION_CI_STATUS.md",
];

const blockedPatterns: Array<{ label: string; regex: RegExp }> = [
  { label: "TODO production", regex: /TODO\s+production/i },
  { label: "mock provider", regex: /mock\s+provider/i },
  { label: "placeholder success", regex: /placeholder\s+success/i },
  { label: "fake success", regex: /fake\s+success/i },
  { label: "foundation-only", regex: /foundation-only/i },
  { label: "pilot-ready", regex: /pilot-ready/i },
  { label: "entityId: 0", regex: /entityId\s*:\s*0\b/ },
  { label: "qtyBefore: 0", regex: /qtyBefore\s*:\s*0\b/ },
  { label: "qtyAfter: 0", regex: /qtyAfter\s*:\s*0\b/ },
  { label: "console.log OTP", regex: /console\.log\(`\[OTP\]/ },
];

function collectFiles(target: string): string[] {
  if (!fs.existsSync(target)) return [];
  const st = fs.statSync(target);
  if (st.isFile()) return [target];
  return fs
    .readdirSync(target)
    .flatMap(entry => collectFiles(`${target}/${entry}`));
}

describe("placeholder production guard", () => {
  const files = sourceFiles
    .flatMap(collectFiles)
    .filter(f => !f.includes("node_modules") && !f.endsWith(".test.ts"));

  it("blocks dangerous placeholder patterns", () => {
    const violations: string[] = [];
    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      for (const p of blockedPatterns) {
        if (p.regex.test(src)) violations.push(`${p.label} in ${file}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("blocks direct audit log insertions outside central audit service", () => {
    const violations: string[] = [];
    const auditAllowlist = new Map([
      [
        "server/db.ts",
        "central bootstrap path that defines DB access primitives",
      ],
      [
        "server/db-extended.ts",
        "extension of central db bootstrap — part of the same audit adapter layer",
      ],
    ]);
    for (const file of files.filter(f => f.endsWith(".ts"))) {
      if (file === "server/services/audit.ts" || auditAllowlist.has(file))
        continue;
      const src = fs.readFileSync(file, "utf8");
      if (src.includes("insert(auditLogs)")) violations.push(file);
    }
    expect(violations).toEqual([]);
  });
});
