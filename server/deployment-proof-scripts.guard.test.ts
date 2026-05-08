import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const node = process.execPath;
const baseEnv = { ...process.env };

function runScript(script: string, args: string[] = [], env: NodeJS.ProcessEnv = {}) {
  return spawnSync(node, [script, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...baseEnv, ...env },
  });
}

function tempDir(name: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `247-${name}-`));
}

describe("deployment proof scripts", () => {
  it("does not print secret values during production env validation", () => {
    const secret = "super-secret-value-that-must-never-appear-123456789";
    const result = runScript("scripts/validate-production-env.mjs", ["--mode", "production"], {
      NODE_ENV: "production",
      APP_ENV: "production",
      DATABASE_URL: "mysql://app_user:db-password@db.internal:3306/customer_app",
      JWT_SECRET: secret,
      SESSION_SECRET: `${secret}-session`,
      RAZORPAY_KEY_ID: "rzp_live_key",
      RAZORPAY_KEY_SECRET: `${secret}-razorpay`,
      RAZORPAY_WEBHOOK_SECRET: `${secret}-webhook`,
      WHATSAPP_ACCESS_TOKEN: `${secret}-whatsapp`,
      BUILT_IN_FORGE_API_URL: "https://storage.internal",
      BUILT_IN_FORGE_API_KEY: `${secret}-storage`,
      CORS_ALLOWED_ORIGINS: "https://app.example.com",
      ADMIN_HEALTH_TOKEN: `${secret}-admin`,
      ENCRYPTION_KEY: `${secret}-encryption`,
    });
    const output = `${result.stdout}${result.stderr}`;
    expect(result.status).toBe(0);
    expect(output).not.toContain(secret);
    expect(output).not.toContain("db-password");
  });

  it("fails when critical production secrets are missing", () => {
    const result = runScript("scripts/validate-production-env.mjs", ["--mode", "production"], {
      NODE_ENV: "production",
      APP_ENV: "production",
      DATABASE_URL: "mysql://app@db.internal:3306/customer_app",
      CORS_ALLOWED_ORIGINS: "https://app.example.com",
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("FAIL session/JWT secrets");
  });

  it("fails wildcard CORS in production", () => {
    const result = runScript("scripts/validate-production-env.mjs", ["--mode", "production"], {
      NODE_ENV: "production",
      APP_ENV: "production",
      DATABASE_URL: "mysql://app@db.internal:3306/customer_app",
      CORS_ALLOWED_ORIGINS: "*",
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("FAIL CORS");
  });

  it("fails demo/test flags in production", () => {
    const result = runScript("scripts/validate-production-env.mjs", ["--mode", "production"], {
      NODE_ENV: "production",
      APP_ENV: "production",
      DATABASE_URL: "mysql://app@db.internal:3306/customer_app",
      CORS_ALLOWED_ORIGINS: "https://app.example.com",
      DEMO_MODE: "true",
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("FAIL demo/test flags");
  });

  it("detects duplicate migration numbers", () => {
    const dir = tempDir("migrations-duplicate");
    fs.writeFileSync(path.join(dir, "0001_first.sql"), "CREATE TABLE a (id int);\n");
    fs.writeFileSync(path.join(dir, "0001_second.sql"), "CREATE TABLE b (id int);\n");
    const result = runScript("scripts/verify-migrations.mjs", ["--migrations-dir", dir]);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("Duplicate migration number 0001");
  });

  it("flags destructive migration statements", () => {
    const dir = tempDir("migrations-destructive");
    fs.writeFileSync(path.join(dir, "0001_first.sql"), "DROP TABLE customers;\n");
    const result = runScript("scripts/verify-migrations.mjs", ["--migrations-dir", dir]);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("Destructive statement");
  });

  it("backup dry-run does not print database password", () => {
    const password = "do-not-print-this-password";
    const result = runScript("scripts/backup-db.mjs", ["--dry-run"], {
      DATABASE_URL: `mysql://backup_user:${password}@db.internal:3306/customer_app`,
      APP_ENV: "test",
    });
    const output = `${result.stdout}${result.stderr}`;
    expect(result.status).toBe(0);
    expect(output).toContain("mysqldump");
    expect(output).not.toContain(password);
  });

  it("restore refuses a production-looking target", () => {
    const dir = tempDir("restore");
    const backup = path.join(dir, "backup.sql");
    fs.writeFileSync(backup, "select 1;\n");
    const result = runScript("scripts/restore-db-drill.mjs", ["--dry-run", "--backup-file", backup], {
      RESTORE_DATABASE_URL: "mysql://restore_user:pw@prod-db.internal:3306/customer_app_prod",
      APP_ENV: "test",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Restore target looks production-like");
  });

  it("release gate summarizes blockers and exits nonzero on critical failure", () => {
    const dir = tempDir("release-gate");
    const result = runScript("scripts/release-gate.mjs", ["--mode", "production", "--artifact-dir", dir], {
      NODE_ENV: "production",
      APP_ENV: "production",
      DATABASE_URL: "mysql://app@db.internal:3306/customer_app",
      CORS_ALLOWED_ORIGINS: "*",
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("blocking failure");
    const report = fs.readFileSync(path.join(dir, "RELEASE_GATE_REPORT.md"), "utf8");
    expect(report).toContain("Production readiness blockers");
    expect(report).toContain("environment validation");
  });
});
