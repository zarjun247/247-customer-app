import { describe, expect, it } from "vitest";
import { providerContracts, type ProviderContractName } from "./config/providerContracts";
import {
  assertProviderNotFakeSuccessful,
  evaluateProviderStatus,
  getAllProviderContracts,
  getProviderContract,
} from "./services/providerContract";
import fs from "node:fs";

const knownProviders: ProviderContractName[] = [
  "razorpay_payment",
  "whatsapp",
  "otp",
  "sms",
  "email",
  "push_notification",
  "ocr",
  "object_storage",
  "maps_geocoding_delivery_distance",
  "tally_erp_export",
  "printer_label_printing",
];

describe("provider contract matrix guards", () => {
  it("has one contract entry for every known external provider", () => {
    expect(getAllProviderContracts().map(contract => contract.providerName).sort()).toEqual(
      [...knownProviders].sort(),
    );
    expect(new Set(providerContracts.map(contract => contract.providerName)).size).toBe(providerContracts.length);
  });

  it("requires production-required providers to list required env vars and fail closed or manual safe", () => {
    const productionRequired = getAllProviderContracts().filter(contract => contract.productionRequired);
    expect(productionRequired.map(contract => contract.providerName).sort()).toEqual([
      "object_storage",
      "otp",
      "razorpay_payment",
    ]);
    for (const contract of productionRequired) {
      expect(contract.requiredEnvVars.length).toBeGreaterThan(0);
      expect(["fail_closed", "manual_only"]).toContain(contract.failureMode);
      expect(contract.unavailableStates).toContain("provider_unconfigured");
    }
  });

  it("does not allow unconfigured production providers to be evaluated as success", () => {
    const env = { NODE_ENV: "production" } as NodeJS.ProcessEnv;
    const statuses = evaluateProviderStatus(env, "production");

    expect(statuses.find(status => status.providerName === "razorpay_payment")).toMatchObject({
      status: "provider_unconfigured",
      configured: false,
      missingEnvVars: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"],
    });
    expect(statuses.find(status => status.providerName === "whatsapp")).toMatchObject({
      status: "provider_unconfigured",
      configured: false,
    });
    expect(statuses.find(status => status.providerName === "sms")).toMatchObject({
      status: "provider_unconfigured",
      configured: false,
    });
    expect(statuses.find(status => status.providerName === "tally_erp_export")).toMatchObject({
      status: "provider_unconfigured",
      configured: false,
    });
  });

  it("does not label demo/test provider outcomes as sent, printed, synced, or verified", () => {
    const env = { NODE_ENV: "test", PROVIDER_DEMO_MODE: "true" } as NodeJS.ProcessEnv;
    const demoStatuses = evaluateProviderStatus(env, "test");
    const disallowedRealSuccess = ["verified", "sent", "printed", "synced"];

    for (const report of demoStatuses) {
      expect(disallowedRealSuccess).not.toContain(report.status);
    }

    expect(demoStatuses.find(status => status.providerName === "razorpay_payment")?.status).toBe("demo_skipped");
    expect(demoStatuses.find(status => status.providerName === "whatsapp")?.status).toBe("demo_skipped");
    expect(demoStatuses.find(status => status.providerName === "printer_label_printing")?.status).toBe("preview_only");
  });

  it("blocks fake-success provider result shapes", () => {
    expect(() =>
      assertProviderNotFakeSuccessful({
        providerName: "razorpay_payment",
        status: "verified",
        ok: true,
        configured: false,
      }),
    ).toThrow(/cannot claim real success/);

    expect(() =>
      assertProviderNotFakeSuccessful({
        providerName: "whatsapp",
        status: "sent",
        ok: true,
        demo: true,
      }),
    ).toThrow(/cannot claim real success/);

    expect(() =>
      assertProviderNotFakeSuccessful({
        providerName: "printer_label_printing",
        status: "preview_only",
        ok: true,
      }),
    ).toThrow(/cannot claim real success/);

    expect(() =>
      assertProviderNotFakeSuccessful({
        providerName: "tally_erp_export",
        status: "synced",
        ok: true,
        missingEnvVars: ["ERP_BASE_URL"],
      }),
    ).toThrow(/cannot claim real success/);
  });

  it("documents payment, WhatsApp, SMS, printer, and ERP/Tally fail-closed status distinctions", () => {
    expect(getProviderContract("razorpay_payment").successStates).toEqual(["verified"]);
    expect(getProviderContract("razorpay_payment").unavailableStates).toEqual(
      expect.arrayContaining(["provider_unconfigured", "demo_skipped", "failed"]),
    );
    expect(getProviderContract("whatsapp").successStates).toContain("sent");
    expect(getProviderContract("sms").successStates).toContain("sent");
    expect(getProviderContract("printer_label_printing").failureMode).toBe("preview_only");
    expect(getProviderContract("printer_label_printing").unavailableStates).toEqual(
      expect.arrayContaining(["preview_only", "not_printed"]),
    );
    expect(getProviderContract("tally_erp_export").successStates).toEqual(
      expect.arrayContaining(["export_generated", "synced"]),
    );
    expect(getProviderContract("tally_erp_export").unavailableStates).toContain("export_generated_not_synced");
  });

  it("marks OCR as human-review/manual-only before purchase or stock mutation", () => {
    const contract = getProviderContract("ocr");
    expect(contract.failureMode).toBe("manual_only");
    expect(contract.successStates).toEqual(["ocr_complete_pending_review"]);
    expect(contract.unavailableStates).toEqual(expect.arrayContaining(["pending_manual_review", "manual_only"]));
    expect(contract.manualInterventionEvents).toEqual(expect.arrayContaining(["draft_pending_review"]));

    const router = fs.readFileSync("server/routers/ocrIngestionRouter.ts", "utf8");
    expect(router.includes("increaseStockForPurchaseCommit")).toBe(false);
  });

  it("marks storage sensitive-file access as audit-required and fail-closed", () => {
    const contract = getProviderContract("object_storage");
    expect(contract.auditRequired).toBe(true);
    expect(contract.failureMode).toBe("fail_closed");
    expect(contract.requiredEnvVars).toEqual(["BUILT_IN_FORGE_API_URL", "BUILT_IN_FORGE_API_KEY"]);
    expect(contract.manualInterventionEvents).toContain("sensitive_file_access_denied");

    const storageProxy = fs.readFileSync("server/_core/storageProxy.ts", "utf8");
    expect(storageProxy).toContain("sdk.authenticateRequest");
    expect(storageProxy).not.toContain("hasBearer");
  });

  it("defines retry/dead-letter/manual-intervention requirements for operational providers", () => {
    for (const name of ["whatsapp", "sms", "ocr", "object_storage", "tally_erp_export", "printer_label_printing"] as const) {
      const contract = getProviderContract(name);
      expect(contract.retryRequired).toBe(true);
      expect(contract.deadLetterRequired).toBe(true);
      expect(contract.opsDashboardStatuses).toEqual(expect.arrayContaining(["retry_scheduled", "dead_letter"]));
      expect(contract.manualInterventionEvents.length).toBeGreaterThan(0);
    }
  });

  it("status helper exposes configured/unconfigured/disabled without raw secret values", () => {
    const env = {
      NODE_ENV: "production",
      RAZORPAY_KEY_ID: "rzp_live_secret_key_id",
      RAZORPAY_KEY_SECRET: "super-secret",
      WHATSAPP_PROVIDER_ENABLED: "false",
    } as NodeJS.ProcessEnv;
    const reports = evaluateProviderStatus(env, "production");

    expect(reports.find(report => report.providerName === "razorpay_payment")).toMatchObject({
      status: "configured",
      configured: true,
      missingEnvVars: [],
    });
    expect(reports.find(report => report.providerName === "whatsapp")).toMatchObject({
      status: "disabled",
      enabled: false,
    });
    expect(JSON.stringify(reports)).not.toContain("super-secret");
    expect(JSON.stringify(reports)).not.toContain("rzp_live_secret_key_id");
  });
});
