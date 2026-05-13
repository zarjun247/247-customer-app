import fs from "node:fs";
import { describe, it, expect } from "vitest";

const routersWithNoLocalAuditHelpers = [
  "server/routers/inventoryRouter.ts",
  "server/routers/prescriptionGovRouter.ts",
  "server/routers/ocrIngestionRouter.ts",
  "server/routers/masterDataRouter.ts",
  "server/routers/masterDataCatalogRouter.ts",
];

function read(p) {
  if (!fs.existsSync(p)) throw new Error(`Watched file missing: ${p}`);
  return fs.readFileSync(p, "utf8");
}

describe("audit unification static guard", () => {
  it("blocks direct db.insert(auditLogs) outside central audit service/db adapters", () => {
    const baseDir = "server";
    const files = fs
      .readdirSync(baseDir, { withFileTypes: true })
      .flatMap(d => {
        const p = `${baseDir}/${d.name}`;
        if (d.isFile() && p.endsWith(".ts")) return [p];
        if (d.isDirectory())
          return fs
            .readdirSync(p)
            .filter(f => f.endsWith(".ts"))
            .map(f => `${p}/${f}`);
        return [];
      });
    const found = files.some(
      f =>
        ![
          "server/services/audit.ts",
          "server/db.ts",
          "server/db-extended.ts",
          "server/audit-unification.guard.test.ts",
        ].includes(f) && /db\.insert\(auditLogs/.test(read(f))
    );
    expect(found).toBe(false);
  });

  it("blocks router-local audit helper wrappers for completed routers only", () => {
    const helperPattern =
      /async function writeAudit|async function writeAuditLog|async function recordAuditEvent|async function createAuditLog|async function logAudit/;
    const found = routersWithNoLocalAuditHelpers.some(f =>
      helperPattern.test(read(f))
    );
    expect(found).toBe(false);
  });

  it("blocks entityId: 0 in production router audit contexts", () => {
    const routerDir = "server/routers";
    const files = fs
      .readdirSync(routerDir)
      .filter(f => f.endsWith(".ts"))
      .map(f => `${routerDir}/${f}`);
    const found = files.some(f => /entityId:\s*0/.test(read(f)));
    expect(found).toBe(false);
  });
});
