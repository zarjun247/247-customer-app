const NODE_ENV = process.env.NODE_ENV ?? "development";
const isProduction = NODE_ENV === "production";

function getEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function isProviderEnabled(
  flag: string,
  defaultEnabled = false
): boolean {
  const raw = process.env[flag];
  if (raw === undefined) return defaultEnabled;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export function requireProductionEnv(name: string, errors: string[]) {
  if (isProduction && !getEnv(name)) errors.push(name);
}

export function assertPaymentWebhookRoutePosture(errors: string[]) {
  if (isProviderEnabled("PAYMENT_WEBHOOK_ENABLED", false)) {
    const routeImplemented = isProviderEnabled(
      "PAYMENT_WEBHOOK_ROUTE_IMPLEMENTED",
      false
    );
    if (!routeImplemented)
      errors.push("PAYMENT_WEBHOOK_ENABLED_UNSUPPORTED_WITHOUT_VERIFIED_ROUTE");
  }
}

export function assertProductionEnvSafe(): void {
  const missing: string[] = [];
  requireProductionEnv("JWT_SECRET", missing);
  requireProductionEnv("DATABASE_URL", missing);

  if (isProviderEnabled("OAUTH_PROVIDER_ENABLED", true))
    requireProductionEnv("OAUTH_SERVER_URL", missing);
  if (isProviderEnabled("STORAGE_PROVIDER_ENABLED", true)) {
    requireProductionEnv("BUILT_IN_FORGE_API_URL", missing);
    requireProductionEnv("BUILT_IN_FORGE_API_KEY", missing);
  }
  if (isProviderEnabled("PAYMENT_PROVIDER_ENABLED", false)) {
    requireProductionEnv("RAZORPAY_KEY_ID", missing);
    requireProductionEnv("RAZORPAY_KEY_SECRET", missing);
    if (isProviderEnabled("PAYMENT_WEBHOOK_ENABLED", false))
      requireProductionEnv("RAZORPAY_WEBHOOK_SECRET", missing);
  }
  if (isProviderEnabled("WHATSAPP_PROVIDER_ENABLED", false))
    requireProductionEnv("WHATSAPP_WEBHOOK_SECRET", missing);
  if (isProviderEnabled("OTP_PROVIDER_ENABLED", false)) {
    requireProductionEnv("OTP_PROVIDER_API_KEY", missing);
    const otpRateBackend = getEnv("OTP_RATE_LIMIT_BACKEND");
    if (
      !["database", "memory_allowed_for_single_instance"].includes(
        otpRateBackend
      )
    )
      missing.push("OTP_RATE_LIMIT_BACKEND");
  }

  // MP7: PII_ENCRYPTION_MASTER_KEY is the ONLY required-in-production env var added across all 8 MPs.
  requireProductionEnv("PII_ENCRYPTION_MASTER_KEY", missing);

  assertPaymentWebhookRoutePosture(missing);
  if (missing.length)
    throw new Error(`Missing required production env: ${missing.join(", ")}`);
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction,
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? "",
  workerCronSecret: process.env.WORKER_CRON_SECRET ?? "",
  workerAdminToken: process.env.WORKER_ADMIN_TOKEN ?? "",
  // OTel — all four are optional. Never add these to assertProductionEnvSafe().
  // otelEndpoint absent → ConsoleSpanExporter (local dev). Present → OTLP HTTP.
  // otelTracesSampler and otelTracesSamplerArg are also read automatically by
  // NodeSDK from the standard OTEL_TRACES_SAMPLER / OTEL_TRACES_SAMPLER_ARG
  // env vars; the fields here are typed references for documentation only.
  otelEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  otelServiceName: process.env.OTEL_SERVICE_NAME ?? "247-customer-app",
  otelTracesSampler:
    process.env.OTEL_TRACES_SAMPLER ?? "parentbased_traceidratio",
  otelTracesSamplerArg: parseFloat(process.env.OTEL_TRACES_SAMPLER_ARG ?? "1"),
  // MP1-rest: METRICS_SCRAPE_TOKEN is optional. When set, /metrics accepts Bearer auth in addition to staff cookie auth.
  metricsScrapeToken: process.env.METRICS_SCRAPE_TOKEN ?? "",
  // MP1-rest PR-B: on-call optional vars. Never add to assertProductionEnvSafe().
  onCallPagerDutyIntegrationKey:
    process.env.ONCALL_PAGERDUTY_INTEGRATION_KEY ?? "",
  onCallAlertEmail: process.env.ONCALL_ALERT_EMAIL ?? "",
  // MP2: chaos + deployment validation optional vars. Never add to assertProductionEnvSafe().
  chaosDrillEnabled:
    (process.env.CHAOS_DRILL_ENABLED ?? "").toLowerCase() === "true",
  deploymentValidationRequired:
    (process.env.DEPLOYMENT_VALIDATION_REQUIRED ?? "").toLowerCase() === "true",
  backupDrillMinIntervalHours: Number(
    process.env.BACKUP_DRILL_MIN_INTERVAL_HOURS ?? "168"
  ),
  // MP5: outbox dispatcher optional vars. Never add to assertProductionEnvSafe().
  outboxDispatchEnabled:
    (process.env.OUTBOX_DISPATCH_ENABLED ?? "").toLowerCase() === "true",
  outboxPollIntervalMs: Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? "5000"),
  outboxBatchSize: Number(process.env.OUTBOX_BATCH_SIZE ?? "20"),
  outboxMaxAttempts: Number(process.env.OUTBOX_MAX_ATTEMPTS ?? "5"),
  // MP6: reservation ledger optional vars. Never add to assertProductionEnvSafe().
  reservationTtlSeconds: Number(process.env.RESERVATION_TTL_SECONDS ?? "900"),
  reservationExpirySweepIntervalMs: Number(
    process.env.RESERVATION_EXPIRY_SWEEP_INTERVAL_MS ?? "30000"
  ),
  reservationExpiryBatchSize: Number(
    process.env.RESERVATION_EXPIRY_BATCH_SIZE ?? "100"
  ),
  stockLockTimeoutMs: Number(process.env.STOCK_LOCK_TIMEOUT_MS ?? "5000"),
  // SM-LM Phase 1: worker enable flags + stock lock cleanup interval
  reservationExpiryWorkerEnabled:
    (process.env.RESERVATION_EXPIRY_WORKER_ENABLED ?? "true").toLowerCase() ===
    "true",
  stockLockCleanupEnabled:
    (process.env.STOCK_LOCK_CLEANUP_ENABLED ?? "true").toLowerCase() === "true",
  stockLockCleanupIntervalMs: Number(
    process.env.STOCK_LOCK_CLEANUP_INTERVAL_MS ?? "60000"
  ),
  // MP7: security hardening optional vars. PII_ENCRYPTION_MASTER_KEY is REQUIRED in production (handled above).
  // CSP_MODE default changed from "off" to "enforce" in SM-B. Set CSP_MODE=report_only for staged rollout.
  cspMode: (process.env.CSP_MODE ?? "enforce") as
    | "off"
    | "report_only"
    | "enforce",
  cspReportUri: process.env.CSP_REPORT_URI ?? "",
  auditChainVerifyOnStartup:
    (process.env.AUDIT_CHAIN_VERIFY_ON_STARTUP ?? "").toLowerCase() === "true",
  apiRateLimitBackend: process.env.API_RATE_LIMIT_BACKEND ?? "memory",
  // MP8: intelligence + eval ledger optional vars. Never add to assertProductionEnvSafe().
  refillRiskLookbackDays: Number(
    process.env.REFILL_RISK_LOOKBACK_DAYS ?? "180"
  ),
  stockoutLookaheadDays: Number(process.env.STOCKOUT_LOOKAHEAD_DAYS ?? "30"),
  continuityGraphMaxNodes: Number(
    process.env.CONTINUITY_GRAPH_MAX_NODES ?? "500"
  ),
  aiEvalLedgerEnabled:
    (process.env.AI_EVAL_LEDGER_ENABLED ?? "true").toLowerCase() === "true",
  // SM-A: store-scope RBAC enforcement mode. Never add to assertProductionEnvSafe().
  // "off" skips enforcement (migration), "log_only" warns without blocking, "enforce" blocks (default).
  storeScopeEnforcementMode: (process.env.STORE_SCOPE_ENFORCEMENT_MODE ??
    "enforce") as "off" | "log_only" | "enforce",
  // SM-B: DPDP + security hardening optional vars. Never add to assertProductionEnvSafe().
  // DPDP_ENFORCEMENT_MODE: "off" | "log_only" | "enforce" (default "enforce")
  dpdpEnforcementMode: (process.env.DPDP_ENFORCEMENT_MODE ?? "enforce") as
    | "off"
    | "log_only"
    | "enforce",
  // DPDP_REGION_REQUIRED: region string e.g. "ap-south-1". When set, boot asserts storage region matches.
  dpdpRegionRequired: process.env.DPDP_REGION_REQUIRED ?? "",
  // CSP_MODE default flipped from "off" to "enforce" in SM-B. Override with CSP_MODE=report_only for staging.
  // (cspMode key above now defaults to "enforce"; the old "off" default is replaced here)
  // CSP_TOKEN_TTL_HOURS: CSRF token TTL in hours (default 24)
  csrfTokenTtlHours: Number(process.env.CSRF_TOKEN_TTL_HOURS ?? "24"),
  // VAULT_ENCRYPTION_KEY_VERSION: active key version for new writes (default 1)
  vaultEncryptionKeyVersion: Number(
    process.env.VAULT_ENCRYPTION_KEY_VERSION ?? "1"
  ),
  // RETENTION_WORKER_ENABLED: opt-in irreversible erasure worker (default "false")
  retentionWorkerEnabled:
    (process.env.RETENTION_WORKER_ENABLED ?? "false").toLowerCase() === "true",
  // DPO_EMAIL: Data Protection Officer contact for grievance template (default "dpo@example.com")
  dpoEmail: process.env.DPO_EMAIL ?? "dpo@example.com",
  // SM-E: final score-lift optional vars. Never add to assertProductionEnvSafe().
  // APP_PHASE: "pilot" | "scaled" | "full" — controls feature flag gating (default "pilot")
  appPhase: (process.env.APP_PHASE ?? "pilot") as "pilot" | "scaled" | "full",
  // DSR_SLA_MONITOR_ENABLED: opt-in DSR SLA monitor worker (default "false")
  dsrSlaMonitorEnabled:
    (process.env.DSR_SLA_MONITOR_ENABLED ?? "false").toLowerCase() === "true",
  // BREACH_NOTIFY_RECIPIENT_EMAIL: email to notify on breach dispatch (default empty = log only)
  breachNotifyRecipientEmail: process.env.BREACH_NOTIFY_RECIPIENT_EMAIL ?? "",
  // CSRF_ENFORCEMENT: "off" | "log_only" | "enforce" (default "log_only" until client wiring is complete)
  csrfEnforcement: (process.env.CSRF_ENFORCEMENT ?? "log_only") as
    | "off"
    | "log_only"
    | "enforce",
  // SM-C: CI hardening + operational tooling optional vars. Never add to assertProductionEnvSafe().
  // DOCKER_REGISTRY: registry prefix for docker push (e.g. "ghcr.io/org"). Empty = no push.
  dockerRegistry: process.env.DOCKER_REGISTRY ?? "",
  // SBOM_FORMAT: "cyclonedx" | "spdx" — format for SBOM generation (default "cyclonedx")
  sbomFormat: (process.env.SBOM_FORMAT ?? "cyclonedx") as "cyclonedx" | "spdx",
  // STAGING_DEPLOY_DRY_RUN: "true" | "false" — default true (no actual deploy)
  stagingDeployDryRun:
    (process.env.STAGING_DEPLOY_DRY_RUN ?? "true").toLowerCase() !== "false",
  // BACKUP_DRILL_ENABLED: "true" | "false" — opt-in real backup drill (default false)
  backupDrillEnabled:
    (process.env.BACKUP_DRILL_ENABLED ?? "false").toLowerCase() === "true",
  // INCIDENT_DRILL_CRON: cron expression for scheduled incident drills (default empty = no schedule)
  incidentDrillCron: process.env.INCIDENT_DRILL_CRON ?? "",
  // RELEASE_CHANNEL: "staging" | "production" — target release channel (default "staging")
  releaseChannel: (process.env.RELEASE_CHANNEL ?? "staging") as
    | "staging"
    | "production",
  // SM-LM Phase 10 (Option B): DOCTOR_CONSULT_URL — external telemedicine redirect URL.
  // When set, the "Consult a Doctor" button deep-links here. Default empty = button hidden.
  // Never add to assertProductionEnvSafe() — optional feature.
  doctorConsultUrl: process.env.DOCTOR_CONSULT_URL ?? "",
};

assertProductionEnvSafe();
