import {
  providerContracts,
  type ProviderContract,
  type ProviderContractName,
  type ProviderSuccessState,
} from "../config/providerContracts";

export type ProviderRuntimeMode =
  | "production"
  | "demo"
  | "test"
  | "development";

export type ProviderStatus =
  | "configured"
  | "provider_unconfigured"
  | "disabled"
  | "demo_skipped"
  | "preview_only"
  | "failed"
  | "unknown";

export type ProviderStatusReport = {
  providerName: ProviderContractName;
  domain: string;
  status: ProviderStatus;
  configured: boolean;
  enabled: boolean;
  mode: ProviderRuntimeMode;
  missingEnvVars: string[];
  productionRequired: boolean;
  demoAllowed: boolean;
  failureMode: ProviderContract["failureMode"];
  successStates: ProviderContract["successStates"];
  unavailableStates: ProviderContract["unavailableStates"];
  auditRequired: boolean;
  retryRequired: boolean;
  deadLetterRequired: boolean;
  manualInterventionEvents: string[];
  opsDashboardStatuses: ProviderContract["opsDashboardStatuses"];
  notes: string;
};

export type ProviderResultLike = {
  providerName?: string;
  status?: string;
  ok?: boolean;
  demo?: boolean;
  configured?: boolean;
  missingEnvVars?: string[];
};

const providerContractMap = new Map<ProviderContractName, ProviderContract>(
  providerContracts.map(contract => [contract.providerName, contract])
);

const providerFlagByName: Partial<Record<ProviderContractName, string>> = {
  razorpay_payment: "PAYMENT_PROVIDER_ENABLED",
  whatsapp: "WHATSAPP_PROVIDER_ENABLED",
  otp: "OTP_PROVIDER_ENABLED",
  sms: "SMS_PROVIDER_ENABLED",
  email: "EMAIL_PROVIDER_ENABLED",
  push_notification: "PUSH_PROVIDER_ENABLED",
  ocr: "OCR_PROVIDER_ENABLED",
  object_storage: "STORAGE_PROVIDER_ENABLED",
  maps_geocoding_delivery_distance: "MAPS_PROVIDER_ENABLED",
  tally_erp_export: "ERP_PROVIDER_ENABLED",
  printer_label_printing: "PRINTER_PROVIDER_ENABLED",
};

function normalizeMode(mode?: string): ProviderRuntimeMode {
  const normalized = String(
    mode ?? process.env.NODE_ENV ?? "development"
  ).toLowerCase();
  if (normalized === "production") return "production";
  if (["demo", "local"].includes(normalized)) return "demo";
  if (normalized === "test") return "test";
  return "development";
}

function isExplicitDemo(
  env: NodeJS.ProcessEnv,
  mode: ProviderRuntimeMode
): boolean {
  const explicit = String(
    env.PROVIDER_DEMO_MODE ?? env.DEMO_MODE ?? env.LOCAL_DEMO_MODE ?? ""
  ).toLowerCase();

  return (
    mode === "demo" ||
    ["1", "true", "yes", "on", "demo", "local", "test"].includes(explicit)
  );
}

function isFlagDisabled(env: NodeJS.ProcessEnv, flagName?: string): boolean {
  if (!flagName) return false;
  const raw = env[flagName];
  if (raw === undefined) return false;
  return ["0", "false", "no", "off", "disabled"].includes(raw.toLowerCase());
}

function getMissingEnvVars(
  contract: ProviderContract,
  env: NodeJS.ProcessEnv
): string[] {
  return contract.requiredEnvVars.filter(name => !(env[name] ?? "").trim());
}

export function getProviderContract(
  name: ProviderContractName
): ProviderContract {
  const contract = providerContractMap.get(name);
  if (!contract) throw new Error(`Unknown provider contract: ${name}`);
  return contract;
}

export function getAllProviderContracts(): ProviderContract[] {
  return providerContracts.map(contract => ({
    ...contract,
    requiredEnvVars: [...contract.requiredEnvVars],
    optionalEnvVars: [...contract.optionalEnvVars],
    successStates: [...contract.successStates],
    unavailableStates: [...contract.unavailableStates],
    manualInterventionEvents: [...contract.manualInterventionEvents],
    opsDashboardStatuses: [...contract.opsDashboardStatuses],
  }));
}

function evaluateContractStatus(
  contract: ProviderContract,
  env: NodeJS.ProcessEnv,
  mode: ProviderRuntimeMode
): ProviderStatusReport {
  const missingEnvVars = getMissingEnvVars(contract, env);
  const configured = missingEnvVars.length === 0;
  const enabled = !isFlagDisabled(
    env,
    providerFlagByName[contract.providerName]
  );
  const demo = isExplicitDemo(env, mode);
  let status: ProviderStatus;

  if (!enabled) status = "disabled";
  else if (!configured && demo && contract.demoAllowed)
    status =
      contract.failureMode === "preview_only" ? "preview_only" : "demo_skipped";
  else if (!configured)
    status =
      contract.failureMode === "preview_only"
        ? "preview_only"
        : "provider_unconfigured";
  else status = "configured";

  return {
    providerName: contract.providerName,
    domain: contract.domain,
    status,
    configured,
    enabled,
    mode,
    missingEnvVars,
    productionRequired: contract.productionRequired,
    demoAllowed: contract.demoAllowed,
    failureMode: contract.failureMode,
    successStates: contract.successStates,
    unavailableStates: contract.unavailableStates,
    auditRequired: contract.auditRequired,
    retryRequired: contract.retryRequired,
    deadLetterRequired: contract.deadLetterRequired,
    manualInterventionEvents: contract.manualInterventionEvents,
    opsDashboardStatuses: contract.opsDashboardStatuses,
    notes: contract.notes,
  };
}

export function evaluateProviderStatus(
  env: NodeJS.ProcessEnv = process.env,
  mode?: string
): ProviderStatusReport[] {
  const runtimeMode = normalizeMode(mode);
  return providerContracts.map(contract =>
    evaluateContractStatus(contract, env, runtimeMode)
  );
}

export function assertProviderNotFakeSuccessful(
  providerResult: ProviderResultLike
): void {
  const status = providerResult.status ?? "unknown";
  const successStates: ProviderSuccessState[] = [
    "verified",
    "sent",
    "delivered",
    "stored",
    "ocr_complete_pending_review",
    "distance_calculated",
    "export_generated",
    "synced",
    "printed",
    "preview_generated",
  ];
  const realSuccessStates = successStates.filter(
    statusName =>
      ![
        "export_generated",
        "preview_generated",
        "ocr_complete_pending_review",
      ].includes(statusName)
  );
  const successLike =
    realSuccessStates.includes(status as ProviderSuccessState) ||
    providerResult.ok === true;
  const unconfigured =
    providerResult.configured === false ||
    Boolean(providerResult.missingEnvVars?.length);
  const demo =
    providerResult.demo === true ||
    ["demo_skipped", "skipped_demo"].includes(status);
  const unavailable = [
    "provider_unconfigured",
    "disabled",
    "demo_skipped",
    "skipped_demo",
    "preview_only",
    "failed",
    "unknown",
    "manual_only",
    "not_printed",
    "export_generated_not_synced",
  ].includes(status);

  if (successLike && (unconfigured || demo || unavailable)) {
    throw new Error(
      `Provider result cannot claim real success while unavailable/demo/unconfigured: ${status}`
    );
  }
}
