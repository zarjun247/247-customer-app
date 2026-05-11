#!/usr/bin/env node
const args = process.argv.slice(2);
const argValue = (name, fallback = "") => {
  const idx = args.findIndex((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`));
  if (idx === -1) return fallback;
  const hit = args[idx];
  return hit.includes("=") ? hit.split("=").slice(1).join("=") : args[idx + 1] || "true";
};
const envClass = argValue("env", process.env.APP_ENV || process.env.NODE_ENV || "staging").toLowerCase();
const requireExternalUrl = ["staging", "production"].includes(envClass);
const env = process.env;
const results = [];
const has = (name) => Boolean(env[name] && String(env[name]).trim());
const enabled = (name) => ["1", "true", "yes", "on"].includes(String(env[name] || "").toLowerCase());
const safeUrl = (name) => {
  if (!has(name)) return false;
  try {
    const parsed = new URL(env[name]);
    return !/localhost|127\.0\.0\.1|example\.com/i.test(parsed.hostname);
  } catch {
    return false;
  }
};
const record = (status, category, message, critical = status === "fail") => results.push({ status, category, message, critical });
const fail = (category, message, critical = true) => record(critical ? "fail" : "warn", category, message, critical);
const pass = (category, message) => record("pass", category, message, false);

if (!["staging", "production", "preview", "test"].includes(envClass)) fail("environment class", "APP_ENV/NODE_ENV must resolve to staging, production, preview, or test.");
else pass("environment class", `Deployment environment class is ${envClass}.`);

if (safeUrl("DEPLOYMENT_URL") || !requireExternalUrl) pass("deployment URL", "Deployment URL posture is acceptable for this environment class.");
else fail("deployment URL", "DEPLOYMENT_URL must be a real non-local URL for staging/production.");

if (safeUrl("DATABASE_URL")) pass("database", "Database URL is present and not local/example.");
else fail("database", "DATABASE_URL must be present and non-local for deployable environments.");

if (has("RELEASE_ARTIFACT_ID") || has("GIT_SHA") || has("VERCEL_GIT_COMMIT_SHA") || has("RAILWAY_GIT_COMMIT_SHA")) pass("artifact identity", "Release artifact or commit identity is present.");
else fail("artifact identity", "Release artifact ID or commit SHA is required for rollback traceability.");

if (has("ROLLBACK_TARGET_ARTIFACT_ID") || envClass !== "production") pass("rollback target", "Rollback target is documented or non-production advisory.");
else fail("rollback target", "ROLLBACK_TARGET_ARTIFACT_ID is required before production release approval.");

if (has("ADMIN_HEALTH_TOKEN") || has("WORKER_ADMIN_TOKEN")) pass("operator health auth", "Operator health/readiness auth is configured.");
else fail("operator health auth", "Admin or worker health token is required for deployment verification.", requireExternalUrl);

const unsafeFlags = ["DISABLE_AUTH", "ALLOW_TEST_AUTH", "USE_MOCK_PROVIDERS", "SEED_DEMO_DATA"].filter(enabled);
if (unsafeFlags.length && ["staging", "production"].includes(envClass)) fail("unsafe flags", `Unsafe flags must be disabled: ${unsafeFlags.join(", ")}.`);
else pass("unsafe flags", "No deployment-blocking unsafe flags are enabled.");

console.log(`Deployment environment validation (${envClass})`);
for (const r of results) console.log(`${r.status.toUpperCase()} ${r.category}: ${r.message}`);
const blockers = results.filter((r) => r.status === "fail" && r.critical);
console.log(`Summary: ${results.filter((r) => r.status === "pass").length} pass, ${results.filter((r) => r.status === "warn").length} warn, ${blockers.length} critical failure(s).`);
process.exitCode = blockers.length ? 1 : 0;
