import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readFiles(paths) {
  const files = [];
  for (const p of paths) {
    if (!fs.existsSync(p)) throw new Error(`Watched file missing: ${p}`);
    const s = fs.readFileSync(p, "utf8");
    files.push({ path: p, content: s });
  }
  return files;
}

function searchInFiles(files, re) {
  const matches = [];
  for (const f of files) {
    if (re.test(f.content)) matches.push(f.path);
  }
  return matches;
}

function listTsFiles(dir) {
  const res = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) res.push(...listTsFiles(p));
    else if (st.isFile() && p.endsWith(".ts")) res.push(p);
  }
  return res;
}

describe("store isolation static guards", () => {
  it("has central rbac helpers", () => {
    const files = readFiles(["server/_core/rbac.ts"]);
    const found = searchInFiles(
      files,
      /requireStoreAccess|requireStaffStore|assertCanCrossStore/
    );
    expect(found.length).toBeGreaterThan(0);
  });

  it("high risk routers include active store access checks", () => {
    const routers = [
      "server/routers/inventoryRouter.ts",
      "server/routers/purchaseRouter.ts",
      "server/routers/salesRouter.ts",
      "server/routers/reportsRouter.ts",
      "server/routers/deliveryRouter.ts",
    ];
    const files = readFiles(routers);
    const found = searchInFiles(files, /requireStoreAccess\(/);
    expect(found.length).toBeGreaterThan(0);
  });

  it("blocks default store fallback patterns", () => {
    const dirs = [
      ...listTsFiles("server/routers"),
      ...listTsFiles("server/_core"),
    ];
    const files = readFiles(dirs);
    const found = searchInFiles(
      files,
      /storeId\s*\?\?\s*1|storeId\s*\|\|\s*1|staffStoreId\s*\?\?\s*1|staffStoreId\s*\|\|\s*1/
    );
    expect(found).toEqual([]);
  });

  it("fails if requireStoreAccess import is unused in touched routers", () => {
    const targets = [
      "server/routers/deliveryRouter.ts",
      "server/routers/reportsRouter.ts",
    ];
    const bad: string[] = [];
    for (const t of targets) {
      const content = fs.existsSync(t) ? fs.readFileSync(t, "utf8") : "";
      const hasImport = /import[\s\S]*?requireStoreAccess/.test(content);
      const hasCall = /requireStoreAccess\(/.test(content);
      if (!(hasImport && hasCall)) bad.push(t);
    }
    expect(bad).toEqual([]);
  });
});
