import { describe, it, expect } from "vitest";
import fs from "fs";

function migrationNumber(name: string): string | null {
  const m = name.match(/^(\d{4})_/);
  return m ? m[1] : null;
}

describe("migration smoke guard", () => {
  const migrationFiles = fs.readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort();

  it("requires schema file", () => {
    expect(fs.existsSync("drizzle/schema.ts")).toBe(true);
  });

  it("ensures sql migration files are non-empty", () => {
    expect(migrationFiles.length).toBeGreaterThan(0);
    for (const file of migrationFiles) {
      const content = fs.readFileSync(`drizzle/${file}`, "utf8").trim();
      expect(content.length, `Empty migration file: ${file}`).toBeGreaterThan(0);
    }
  });

  it("has unique numbered migration prefixes", () => {
    const numbered = migrationFiles.map((f) => migrationNumber(f)).filter((n): n is string => !!n);
    const unique = new Set(numbered);
    expect(unique.size).toBe(numbered.length);
  });

  it("ensures numbered migrations are monotonically non-decreasing and exposes latest", () => {
    const numbered = migrationFiles
      .map((f) => ({ file: f, n: migrationNumber(f) }))
      .filter((x): x is { file: string; n: string } => !!x.n)
      .map((x) => Number(x.n));

    for (let i = 1; i < numbered.length; i++) {
      expect(numbered[i]).toBeGreaterThanOrEqual(numbered[i - 1]);
    }

    const latest = numbered[numbered.length - 1];
    expect(Number.isFinite(latest)).toBe(true);
  });
});
