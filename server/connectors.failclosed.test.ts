import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  erpConnector,
  isExplicitDemoMode,
  labelPrinterConnector,
  smsConnector,
} from "./connectors";

const ORIGINAL_ENV = { ...process.env };

function resetProviderEnv(overrides: NodeJS.ProcessEnv = {}) {
  process.env = {
    ...ORIGINAL_ENV,
    NODE_ENV: "production",
    SMS_PROVIDER_API_KEY: undefined,
    WHATSAPP_PHONE_NUMBER_ID: undefined,
    WHATSAPP_API_TOKEN: undefined,
    PRINTER_HOST: undefined,
    ERP_BASE_URL: undefined,
    ERP_API_KEY: undefined,
    PROVIDER_DEMO_MODE: undefined,
    DEMO_MODE: undefined,
    ...overrides,
  };
}

describe("non-payment provider fail-closed behavior", () => {
  beforeEach(() => {
    resetProviderEnv();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  it("fails closed for missing SMS credentials in production", async () => {
    const detailed = await smsConnector.sendSmsDetailed({
      phone: "+919876543210",
      message: "Pickup ready",
    });

    expect(detailed).toMatchObject({
      status: "provider_unconfigured",
      ok: false,
    });
    await expect(
      smsConnector.sendSms({ phone: "+919876543210", message: "Pickup ready" })
    ).resolves.toBe(false);
    expect(console.log).not.toHaveBeenCalledWith(
      expect.stringContaining("[SMS STUB]")
    );
  });

  it("fails closed for missing WhatsApp credentials in production", async () => {
    const detailed = await smsConnector.sendWhatsAppDetailed({
      phone: "+919876543210",
      templateName: "order_ready",
      variables: ["A001"],
    });

    expect(detailed).toMatchObject({
      status: "provider_unconfigured",
      ok: false,
    });
    expect(detailed.reason).toContain("WHATSAPP_PHONE_NUMBER_ID");
    expect(detailed.reason).toContain("WHATSAPP_API_TOKEN");
    await expect(
      smsConnector.sendWhatsApp({
        phone: "+919876543210",
        templateName: "order_ready",
        variables: ["A001"],
      })
    ).resolves.toBe(false);
    expect(console.log).not.toHaveBeenCalledWith(
      expect.stringContaining("[WhatsApp STUB]")
    );
  });

  it("does not claim printed success when production printer host is missing", async () => {
    const detailed = await labelPrinterConnector.printBatchLabelDetailed({
      productName: "Paracetamol",
      batchNumber: "B001",
      expiryDate: "2027-01",
      mrp: "12.00",
    });

    expect(detailed).toMatchObject({
      status: "provider_unconfigured",
      ok: false,
    });
    expect(detailed.status).not.toBe("printed");
    await expect(
      labelPrinterConnector.printBatchLabel({
        productName: "Paracetamol",
        batchNumber: "B001",
        expiryDate: "2027-01",
        mrp: "12.00",
      })
    ).resolves.toBe(false);
    expect(console.log).not.toHaveBeenCalledWith(
      expect.stringContaining("[Printer STUB]")
    );
  });

  it("does not claim ERP synced when production ERP credentials are missing", async () => {
    const result = await erpConnector.pushSalesOrder({
      orderId: 101,
      storeId: 1,
      totalAmount: 250,
      items: [{ productName: "ORS", qty: 1, unitPrice: 250 }],
    });

    expect(result).toMatchObject({
      status: "provider_unconfigured",
      ok: false,
      erpRef: null,
    });
    expect(result.status).not.toBe("synced");
    expect(console.log).not.toHaveBeenCalledWith(
      expect.stringContaining("[ERP STUB]")
    );
  });

  it("keeps explicit local/demo skips visible and non-successful", async () => {
    resetProviderEnv({ PROVIDER_DEMO_MODE: "true" });

    expect(isExplicitDemoMode()).toBe(true);

    await expect(
      smsConnector.sendSmsDetailed({ phone: "+919876543210", message: "Demo" })
    ).resolves.toMatchObject({ status: "skipped_demo", ok: false, demo: true });
    await expect(
      labelPrinterConnector.printDispatchLabelDetailed({
        orderId: 77,
        customerName: "Demo Customer",
        address: "Demo Address",
        phone: "+919876543210",
        items: [{ name: "Demo Item", qty: 1 }],
      })
    ).resolves.toMatchObject({ status: "skipped_demo", ok: false, demo: true });
    await expect(
      erpConnector.pushGrn({
        ingestionId: 9,
        storeId: 1,
        items: [
          {
            productName: "Demo",
            batchNumber: "D1",
            qty: 1,
            unitCost: 1,
            mrp: 2,
          },
        ],
      })
    ).resolves.toMatchObject({
      status: "skipped_demo",
      ok: false,
      demo: true,
      erpRef: null,
    });

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("DEMO SKIPPED")
    );
  });
});
