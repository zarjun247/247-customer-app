#!/usr/bin/env node
const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const hit = args.find((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`));
  if (!hit) return fallback;
  if (hit.includes("=")) return hit.split("=").slice(1).join("=");
  const idx = args.indexOf(hit);
  return args[idx + 1] && !args[idx + 1].startsWith("--") ? args[idx + 1] : "true";
};
const mode = argValue("mode", process.env.APP_ENV || process.env.NODE_ENV || "test").toLowerCase();
const isProduction = mode === "production" || process.env.NODE_ENV === "production" || process.env.APP_ENV === "production";
const allowLocalDb = ["1", "true", "yes"].includes(String(process.env.ALLOW_PRODUCTION_LOCAL_DATABASE || "").toLowerCase());
const minSecretLength = Number(process.env.MIN_PRODUCTION_SECRET_LENGTH || 32);
const env = process.env;
const results = [];
const has = (name) => Boolean(env[name] && String(env[name]).trim());
const secretOk = (name) => has(name) && String(env[name]).length >= minSecretLength;
const enabled = (name) => ["1", "true", "yes", "on", "enabled"].includes(String(env[name] || "").toLowerCase());
const fail = (category, message, critical = isProduction) => results.push({ category, status: critical ? "fail" : "warn", message, critical });
const pass = (category, message) => results.push({ category, status: "pass", message, critical: false });

if (isProduction) {
  if (env.NODE_ENV !== "production" || (env.APP_ENV && env.APP_ENV !== "production")) fail("runtime mode", "NODE_ENV and APP_ENV must identify production.");
  else pass("runtime mode", "Production runtime mode is explicit.");
} else pass("runtime mode", `Validated in ${mode} mode; production-only requirements are advisory.`);

if (!has("DATABASE_URL")) fail("database", "DATABASE_URL is required for production.");
else if (isProduction && !allowLocalDb && /localhost|127\.0\.0\.1|demo|example|test/i.test(env.DATABASE_URL)) fail("database", "DATABASE_URL must not point at localhost, demo, example, or test endpoints in production.");
else pass("database", "Database URL is present and passes production endpoint posture checks.");

if (secretOk("JWT_SECRET") && (secretOk("SESSION_SECRET") || secretOk("COOKIE_SECRET"))) pass("session/JWT secrets", "JWT and session cookie secret posture is strong.");
else fail("session/JWT secrets", `JWT_SECRET plus SESSION_SECRET or COOKIE_SECRET must be present and at least ${minSecretLength} characters.`);

if (has("RAZORPAY_KEY_ID") && has("RAZORPAY_KEY_SECRET")) pass("payment provider", "Payment provider credentials are configured.");
else fail("payment provider", "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required before production payment claims.");
if (secretOk("RAZORPAY_WEBHOOK_SECRET") || secretOk("PAYMENT_WEBHOOK_SECRET")) pass("payment webhook", "Payment webhook secret posture is strong.");
else fail("payment webhook", `Payment webhook secret must be present and at least ${minSecretLength} characters.`);

const commsConfigured = has("WHATSAPP_ACCESS_TOKEN") || has("SMS_PROVIDER_API_KEY") || has("EMAIL_PROVIDER_API_KEY") || has("SMTP_URL");
if (commsConfigured) pass("WhatsApp/SMS/email", "At least one outbound communication provider is configured.");
else fail("WhatsApp/SMS/email", "Configure WhatsApp, SMS, or email provider credentials before production notification claims.");

if ((has("S3_BUCKET") && (has("S3_ACCESS_KEY_ID") || has("AWS_ACCESS_KEY_ID"))) || (has("BUILT_IN_FORGE_API_URL") && has("BUILT_IN_FORGE_API_KEY"))) pass("object storage", "Object storage posture is configured.");
else fail("object storage", "Object storage endpoint and credential posture is required for production sensitive-file access.");

if (enabled("OCR_PRODUCTION_ENABLED")) {
  if (has("OCR_PROVIDER_API_KEY") || has("OCR_ENDPOINT")) pass("OCR provider", "Production OCR is enabled and provider posture is configured.");
  else fail("OCR provider", "OCR_PRODUCTION_ENABLED requires OCR provider credentials or endpoint.");
} else pass("OCR provider", "Production OCR is not enabled; OCR provider check is not blocking.");

const cors = env.CORS_ALLOWED_ORIGINS || env.ALLOWED_ORIGINS || "";
if (isProduction && (!cors || cors.split(",").map((x) => x.trim()).includes("*"))) fail("CORS", "Production CORS allowed origins must be explicit and non-wildcard.");
else pass("CORS", cors ? "CORS origins are explicit or non-production." : "CORS origins are unset in non-production mode.");

if (secretOk("ADMIN_HEALTH_TOKEN") || has("ADMIN_AUTH_PROVIDER") || secretOk("WORKER_ADMIN_TOKEN")) pass("admin health/auth", "Admin health/auth posture is configured.");
else fail("admin health/auth", `Admin health token, worker admin token, or admin auth provider must be configured with strong secret material.`);

if (secretOk("ENCRYPTION_KEY") || secretOk("DATA_ENCRYPTION_KEY") || secretOk("PRESCRIPTION_VAULT_ENCRYPTION_KEY")) pass("encryption/key material", "Encryption key material posture is strong.");
else fail("encryption/key material", `Encryption key material must be present and at least ${minSecretLength} characters.`);

const demoFlags = ["DEMO_MODE", "PROVIDER_DEMO_MODE", "USE_MOCK_PROVIDERS", "SEED_DEMO_DATA", "DISABLE_AUTH", "ALLOW_TEST_AUTH"].filter(enabled);
if (isProduction && demoFlags.length) fail("demo/test flags", `Production demo/test flags must be disabled: ${demoFlags.join(", ")}.`);
else pass("demo/test flags", "Demo/test bypass flags are not enabled for production.");

console.log(`Environment validation (${mode})`);
for (const r of results) console.log(`${r.status.toUpperCase()} ${r.category}: ${r.message}`);
const blockers = results.filter((r) => r.status === "fail" && r.critical);
console.log(`Summary: ${results.filter((r) => r.status === "pass").length} pass, ${results.filter((r) => r.status === "warn").length} warn, ${blockers.length} critical failure(s).`);
process.exitCode = blockers.length ? 1 : 0;
