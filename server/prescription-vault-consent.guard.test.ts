import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  assertPrescriptionUsableForCustomer,
  canUsePrescriptionOnFile,
  isPrescriptionExpired,
} from "./services/prescriptionVault";

const migration = readFileSync("drizzle/0034_prescription_vault_consent.sql", "utf8");
const schema = readFileSync("drizzle/schema.ts", "utf8");
const router = readFileSync("server/routers.ts", "utf8");
const govRouter = readFileSync("server/routers/prescriptionGovRouter.ts", "utf8");

describe("prescription vault consent hardening", () => {
  it("adds nullable metadata, consent, on-file, and access audit schema fields", () => {
    for (const field of [
      "doctorRegNo",
      "clinicName",
      "prescriptionDate",
      "validUntil",
      "source",
      "consentGivenAt",
      "consentSource",
      "consentRevokedAt",
      "onFileMarkedBy",
      "onFileMarkedAt",
      "actorId",
      "actorRole",
      "channel",
      "accessedAt",
    ]) {
      expect(schema).toContain(field);
      expect(migration).toContain(`\`${field}\``);
    }
  });

  it("persists optional upload metadata without weakening PR #50 upload guards", () => {
    expect(router).toContain("metadata: z.object");
    expect(router).toContain("doctorRegNo");
    expect(router).toContain("clinicName");
    expect(router).toContain("linkedProductIds");
    expect(router).toContain("buffer.length > 8 * 1024 * 1024");
    expect(router).toContain("Unsupported file type");
    expect(router).toContain("Invalid file signature");
    expect(router).toContain("rule.magic.every");
  });

  it("requires explicit consent and approved status before markOnFile records governance metadata", () => {
    expect(router).toContain("consentGiven: z.literal(true)");
    expect(router).toContain('rx.status !== "approved"');
    expect(router).toContain("markPrescriptionOnFile(input.id, ctx.user.id");
    expect(schema).toContain("consentGivenAt: timestamp");
    expect(schema).toContain("onFileMarkedBy: int");
  });

  it("logs customer, staff/pharmacist, and API vault access with role/purpose/channel", () => {
    expect(router).toContain("logPrescriptionVaultAccess");
    expect(router).toContain("customer_detail_view");
    expect(router).toContain("customer_vault_list");
    expect(govRouter).toContain("pharmacist_review");
    expect(govRouter).toContain("counter_billing_rx_gate");
    expect(govRouter).toContain("actorRole");
    expect(govRouter).toContain("channel");
  });

  it("does not expose another customer's prescription in customer detail", () => {
    expect(router).toContain("!rx || rx.userId !== ctx.user.id");
    expect(router).toContain('throw new TRPCError({ code: "NOT_FOUND" });');
  });

  it("rejects expired or revoked on-file prescriptions via usability helpers", () => {
    const now = new Date("2026-05-07T00:00:00.000Z");
    expect(isPrescriptionExpired({ validUntil: "2026-05-06T23:59:59.000Z" }, now)).toBe(true);
    expect(canUsePrescriptionOnFile({ id: 1, userId: 7, status: "on_file", consentRevokedAt: now }).usable).toBe(false);
    expect(canUsePrescriptionOnFile({ id: 1, userId: 7, status: "on_file", validUntil: "2026-05-06T23:59:59.000Z" }, now).reason).toContain("expired");
    expect(assertPrescriptionUsableForCustomer({ id: 1, userId: 8, status: "on_file" }, 7).reason).toContain("does not belong");
    expect(assertPrescriptionUsableForCustomer({ id: 1, userId: 7, status: "on_file", validUntil: "2026-05-08T00:00:00.000Z" }, 7, now).usable).toBe(true);
  });
});
