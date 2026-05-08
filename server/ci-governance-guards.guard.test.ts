import { describe, expect, it } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const repoRoot = process.cwd();
const scriptPath = path.join(repoRoot, "scripts/ci-governance-guards.mjs");

function withTempRepo(files: Record<string, string>, run: (root: string) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ci-governance-guards-"));
  try {
    for (const [file, content] of Object.entries(files)) {
      const full = path.join(root, file);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function runGuard(root: string, mode = "all") {
  return execFileSync(process.execPath, [scriptPath, mode, "--root", root], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
  });
}

function expectGuardFailure(files: Record<string, string>, expected: RegExp, mode = "all") {
  withTempRepo(files, (root) => {
    expect(() => runGuard(root, mode)).toThrowError(expected);
  });
}

describe("CI governance guard scanner", () => {
  it("passes a minimal clean fixture", () => {
    withTempRepo(
      {
        "server/safe.ts": "export const status = { ok: false, status: 'provider_unconfigured' };\n",
        "client/src/routes/adminRoutes.tsx": "export const adminRoutes = [];\n",
        "client/src/App.tsx": "import { AdminRoutes } from './routes/adminRoutes';\nexport const App = () => <AdminRoutes />;\n",
        "drizzle/schema.ts": "export const schema = {};\n",
        "drizzle/0001_init.sql": "select 1;\n",
      },
      (root) => expect(runGuard(root)).toContain("CI governance guard scan passed"),
    );
  });

  it("catches merge conflict markers", () => {
    expectGuardFailure(
      { "server/conflict.ts": `${"<".repeat(7)} HEAD\nexport const broken = true;\n${"=".repeat(7)}\nexport const other = true;\n${">".repeat(7)} branch\n` },
      /merge conflict marker/,
      "static",
    );
  });

  it("catches fake/provider success text in runtime files", () => {
    expectGuardFailure(
      { "server/provider.ts": "export const result = 'fake success';\n" },
      /fake\/provider success marker: fake success/,
      "static",
    );
  });

  it("catches provider-unconfigured success claims", () => {
    expectGuardFailure(
      { "server/provider.ts": "export const result = { status: 'provider_unconfigured', ok: true };\n" },
      /provider-unconfigured success claim/,
      "static",
    );
  });

  it("catches unsafe H1 numeric casts and entityId zero fallbacks", () => {
    expectGuardFailure(
      { "server/routers/h1Router.ts": "export const bad = Number(saleId);\nexport const audit = { entityId: 0 };\n" },
      /unsafe H1 numeric\/audit fallback/,
      "static",
    );
  });

  it("catches direct admin route bypasses outside centralized AdminRoutes", () => {
    expectGuardFailure(
      { "client/src/App.tsx": "export const App = () => <Route path=\"/admin\">Admin</Route>;\n" },
      /direct \/admin <Route>/,
      "static",
    );
  });

  it("catches direct stock mutation outside invariant gateways", () => {
    expectGuardFailure(
      { "server/routers/unsafeStockRouter.ts": "await db.update(batchLedger).set({ qtyOnHand: 0 });\n" },
      /direct stock mutation outside invariant gateway/,
      "static",
    );
  });

  it("catches duplicate migration numbers", () => {
    expectGuardFailure(
      {
        "drizzle/schema.ts": "export const schema = {};\n",
        "drizzle/0001_init.sql": "select 1;\n",
        "drizzle/0001_duplicate.sql": "select 1;\n",
      },
      /duplicate migration number 0001/,
      "migration",
    );
  });
});
