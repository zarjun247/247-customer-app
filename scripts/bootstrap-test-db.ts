import { spawn } from "node:child_process";
import { requireSafeTestDatabaseUrl } from "../server/testUtils/dbTestLifecycle";

// Validate the test database URL before delegating to the migration runner.
// This enforces the "must contain 'test'" and "must not equal DATABASE_URL"
// safety checks before any SQL is executed.
const url = requireSafeTestDatabaseUrl();

// Expose as DATABASE_URL so apply-migrations.mjs and bootstrap-migrations-table.mjs
// can read it without needing to know about the TEST_ prefix.
process.env.DATABASE_URL = url;

async function runScript(script: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("node", [script], {
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("exit", code => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with code ${code ?? "unknown"}`));
    });
  });
}

await runScript("scripts/bootstrap-migrations-table.mjs");
await runScript("scripts/apply-migrations.mjs");
console.log("Test MySQL database is bootstrapped and all migrations applied.");
