const NODE_ENV = process.env.NODE_ENV ?? "development";
const isProduction = NODE_ENV === "production";

function getEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function isProviderEnabled(flag: string, defaultEnabled = false): boolean {
  const raw = process.env[flag];
  if (raw === undefined) return defaultEnabled;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export function requireProductionEnv(name: string, errors: string[]) {
  if (isProduction && !getEnv(name)) errors.push(name);
}

export function assertProductionEnvSafe(): void {
  const missing: string[] = [];
  requireProductionEnv("JWT_SECRET", missing);
  requireProductionEnv("DATABASE_URL", missing);

  if (isProviderEnabled("OAUTH_PROVIDER_ENABLED", true)) requireProductionEnv("OAUTH_SERVER_URL", missing);
  if (isProviderEnabled("STORAGE_PROVIDER_ENABLED", true)) {
    requireProductionEnv("BUILT_IN_FORGE_API_URL", missing);
    requireProductionEnv("BUILT_IN_FORGE_API_KEY", missing);
  }
  if (isProviderEnabled("PAYMENT_PROVIDER_ENABLED", false)) {
    requireProductionEnv("RAZORPAY_KEY_ID", missing);
    requireProductionEnv("RAZORPAY_KEY_SECRET", missing);
  }
  if (isProviderEnabled("WHATSAPP_PROVIDER_ENABLED", false)) requireProductionEnv("WHATSAPP_WEBHOOK_SECRET", missing);
  if (isProviderEnabled("OTP_PROVIDER_ENABLED", false)) {
    requireProductionEnv("OTP_PROVIDER_API_KEY", missing);
    const otpRateBackend = getEnv("OTP_RATE_LIMIT_BACKEND");
    if (!["database", "memory_allowed_for_single_instance"].includes(otpRateBackend)) missing.push("OTP_RATE_LIMIT_BACKEND");
  }

  if (missing.length) throw new Error(`Missing required production env: ${missing.join(", ")}`);
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
};

assertProductionEnvSafe();
