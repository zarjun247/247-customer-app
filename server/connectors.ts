/**
 * External Service Connectors
 *
 * Typed interfaces and real implementations for all external integrations.
 * Each connector reads credentials from environment variables. Non-payment
 * providers fail closed in production when credentials are absent; local/demo
 * skips are explicit and never reported as production success.
 *
 * Connectors:
 *   - SMS / WhatsApp (MSG91 + WhatsApp Cloud API)
 *   - Payment Gateway (Razorpay — real SDK integration)
 *   - Label Printer (ZPL for thermal printers)
 *   - ERP Sync (Tally/SAP REST adapter)
 */

import crypto from "crypto";
import { notifyOwner } from "./_core/notification";
import type { NotificationPayload } from "./notifications";

// ─── SMS / WhatsApp Connector ─────────────────────────────────────────────────

export type MessageProviderStatus =
  | "sent"
  | "failed"
  | "provider_unconfigured"
  | "skipped_demo";

export type PrinterProviderStatus =
  | "printed"
  | "failed"
  | "provider_unconfigured"
  | "skipped_demo"
  | "preview_only"
  | "not_printed";

export type ErpProviderStatus =
  | "synced"
  | "failed"
  | "provider_unconfigured"
  | "skipped_demo";

export type ProviderResult<TStatus extends string> = {
  status: TStatus;
  ok: boolean;
  reason?: string;
  demo?: boolean;
};

export type MessageProviderResult = ProviderResult<MessageProviderStatus>;

export type PrinterProviderResult = ProviderResult<PrinterProviderStatus> & {
  zpl?: string;
};

export type ErpProviderResult = ProviderResult<ErpProviderStatus> & {
  erpRef: string | null;
};

export function isExplicitDemoMode(): boolean {
  const explicit = String(
    process.env.PROVIDER_DEMO_MODE ?? process.env.DEMO_MODE ?? "",
  ).toLowerCase();

  return (
    ["1", "true", "yes", "on", "demo", "local"].includes(explicit) ||
    ["development", "test"].includes(
      String(process.env.NODE_ENV ?? "").toLowerCase(),
    )
  );
}

export function isProductionMode(): boolean {
  return String(process.env.NODE_ENV ?? "").toLowerCase() === "production";
}

export function providerUnavailableResult<
  TStatus extends "provider_unconfigured" | "skipped_demo",
>(provider: string, missing: string[]): ProviderResult<TStatus> {
  if (isProductionMode() && !isExplicitDemoMode()) {
    return {
      status: "provider_unconfigured" as TStatus,
      ok: false,
      reason: `${provider} provider unconfigured: missing ${missing.join(", ")}`,
    };
  }

  return {
    status: "skipped_demo" as TStatus,
    ok: false,
    demo: true,
    reason: `${provider} provider skipped in explicit local/demo mode: missing ${missing.join(", ")}`,
  };
}

export interface SmsConnector {
  sendSms(params: { phone: string; message: string }): Promise<boolean>;

  sendSmsDetailed(params: {
    phone: string;
    message: string;
  }): Promise<MessageProviderResult>;

  sendWhatsApp(params: {
    phone: string;
    templateName: string;
    variables: string[];
  }): Promise<boolean>;

  sendWhatsAppDetailed(params: {
    phone: string;
    templateName: string;
    variables: string[];
  }): Promise<MessageProviderResult>;
}

/**
 * MSG91 SMS connector.
 * Required env vars:
 *   SMS_PROVIDER_API_KEY     — MSG91 auth key
 *   SMS_SENDER_ID            — DLT-approved sender ID (e.g. PHRMCY)
 *   WHATSAPP_PHONE_NUMBER_ID — WhatsApp Business phone number ID
 *   WHATSAPP_API_TOKEN       — WhatsApp Cloud API token
 */
export const smsConnector: SmsConnector = {
  async sendSms(params) {
    const result = await this.sendSmsDetailed(params);
    return result.status === "sent";
  },

  async sendSmsDetailed({ phone, message }) {
    const apiKey = process.env.SMS_PROVIDER_API_KEY;
    const senderId = process.env.SMS_SENDER_ID ?? "PHRMCY";

    if (!apiKey) {
      const result = providerUnavailableResult<
        "provider_unconfigured" | "skipped_demo"
      >("SMS", ["SMS_PROVIDER_API_KEY"]);

      if (result.status === "skipped_demo") {
        console.log(`[SMS DEMO SKIPPED] To: ${phone} | Message: ${message}`);
      }

      return result;
    }

    try {
      const normalizedPhone = phone.replace(/^\+/, "").replace(/^0/, "");
      const mobileWithCountry = normalizedPhone.startsWith("91")
        ? normalizedPhone
        : `91${normalizedPhone}`;

      const payload = {
        sender: senderId,
        route: "4",
        country: "91",
        sms: [{ message, to: [mobileWithCountry] }],
      };

      const res = await fetch("https://api.msg91.com/api/v5/flow/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authkey: apiKey,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`[SMS] MSG91 error: ${res.status} ${text}`);

        return {
          status: "failed",
          ok: false,
          reason: `MSG91 error: ${res.status}`,
        };
      }

      return { status: "sent", ok: true };
    } catch (err) {
      console.error("[SMS] Failed to send via MSG91:", err);

      return {
        status: "failed",
        ok: false,
        reason: "MSG91 request failed",
      };
    }
  },

  async sendWhatsApp(params) {
    const result = await this.sendWhatsAppDetailed(params);
    return result.status === "sent";
  },

  async sendWhatsAppDetailed({ phone, templateName, variables }) {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const token = process.env.WHATSAPP_API_TOKEN;

    const missing = [
      ...(!phoneNumberId ? ["WHATSAPP_PHONE_NUMBER_ID"] : []),
      ...(!token ? ["WHATSAPP_API_TOKEN"] : []),
    ];

    if (missing.length > 0) {
      const result = providerUnavailableResult<
        "provider_unconfigured" | "skipped_demo"
      >("WhatsApp", missing);

      if (result.status === "skipped_demo") {
        console.log(
          `[WhatsApp DEMO SKIPPED] To: ${phone} | Template: ${templateName} | Vars: ${variables.join(", ")}`,
        );
      }

      return result;
    }

    try {
      const normalizedPhone = phone.replace(/^\+/, "").replace(/^0/, "");
      const to = normalizedPhone.startsWith("91")
        ? normalizedPhone
        : `91${normalizedPhone}`;

      const body = {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: "en" },
          components:
            variables.length > 0
              ? [
                  {
                    type: "body",
                    parameters: variables.map(v => ({
                      type: "text",
                      text: v,
                    })),
                  },
                ]
              : [],
        },
      };

      const res = await fetch(
        `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        },
      );

      if (!res.ok) {
        const text = await res.text();
        console.error(`[WhatsApp] Cloud API error: ${res.status} ${text}`);

        return {
          status: "failed",
          ok: false,
          reason: `WhatsApp Cloud API error: ${res.status}`,
        };
      }

      return { status: "sent", ok: true };
    } catch (err) {
      console.error("[WhatsApp] Failed to send:", err);

      return {
        status: "failed",
        ok: false,
        reason: "WhatsApp Cloud API request failed",
      };
    }
  },
};

/**
 * Sends a customer notification via SMS and optionally WhatsApp.
 * Falls back to owner notification if SMS fails.
 */
export async function sendCustomerNotification(
  phone: string,
  payload: NotificationPayload,
): Promise<void> {
  const message = `${payload.title}\n${payload.content}`;
  const sent = await smsConnector.sendSms({ phone, message });

  if (!sent) {
    await notifyOwner({
      title: `[FALLBACK] Customer notification failed`,
      content: `Phone: ${phone} | ${payload.title}`,
    });
  }
}

// ─── Payment Gateway Connector ────────────────────────────────────────────────

export interface PaymentGatewayConnector {
  createOrder(params: {
    amount: number;
    currency: string;
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<{ gatewayOrderId: string; amount: number; currency: string }>;

  verifyPayment(params: {
    gatewayOrderId: string;
    gatewayPaymentId: string;
    signature: string;
  }): Promise<boolean>;

  refund(params: {
    gatewayPaymentId: string;
    amount?: number;
    reason?: string;
  }): Promise<{ refundId: string; status: string }>;
}

function isExplicitPaymentDemoMode(): boolean {
  const mode = String(
    process.env.PAYMENT_PROVIDER_MODE ?? process.env.LOCAL_DEMO_MODE ?? "",
  )
    .trim()
    .toLowerCase();

  return (
    ["1", "true", "yes", "on", "demo", "local", "test"].includes(mode) ||
    String(process.env.NODE_ENV ?? "").toLowerCase() === "test"
  );
}

/**
 * Razorpay payment connector — real SDK integration.
 * Required env vars:
 *   RAZORPAY_KEY_ID     — Razorpay API key ID
 *   RAZORPAY_KEY_SECRET — Razorpay API key secret
 *
 * Credentials are required for real gateway calls. Production fails closed when
 * credentials are absent. Explicit demo/test verification returns false instead
 * of pretending a payment is verified.
 */
export const paymentConnector: PaymentGatewayConnector = {
  async createOrder({ amount, currency, receipt, notes }) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      throw new Error(
        "Payment provider_unconfigured: RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET missing",
      );
    }

    try {
      const Razorpay = (await import("razorpay")).default;
      const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });

      const order = await rzp.orders.create({
        amount,
        currency,
        receipt,
        notes,
      });

      return {
        gatewayOrderId: order.id,
        amount:
          typeof order.amount === "number"
            ? order.amount
            : parseInt(String(order.amount), 10),
        currency: order.currency,
      };
    } catch (err) {
      console.error("[Payment] Razorpay createOrder failed:", err);
      throw new Error("Payment gateway error. Please try again.");
    }
  },

  async verifyPayment({ gatewayOrderId, gatewayPaymentId, signature }) {
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keySecret) {
      if (isExplicitPaymentDemoMode()) return false;

      throw new Error(
        "Payment provider_unconfigured: RAZORPAY_KEY_SECRET missing",
      );
    }

    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${gatewayOrderId}|${gatewayPaymentId}`)
      .digest("hex");

    return expectedSignature === signature;
  },

  async refund({ gatewayPaymentId, amount, reason }) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      throw new Error("Payment refund unavailable: provider_unconfigured");
    }

    try {
      const Razorpay = (await import("razorpay")).default;
      const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });

      const refund = await rzp.payments.refund(gatewayPaymentId, {
        amount,
        notes: reason ? { reason } : undefined,
      });

      return {
        refundId: refund.id,
        status: refund.status,
      };
    } catch (err) {
      console.error("[Payment] Razorpay refund failed:", err);
      throw new Error("Refund failed. Please contact support.");
    }
  },
};

// ─── Label Printer Connector ──────────────────────────────────────────────────

export interface LabelPrinterConnector {
  printDispatchLabel(params: {
    orderId: number;
    customerName: string;
    address: string;
    phone: string;
    items: Array<{ name: string; qty: number }>;
    barcodeData?: string;
  }): Promise<boolean>;

  printDispatchLabelDetailed(params: {
    orderId: number;
    customerName: string;
    address: string;
    phone: string;
    items: Array<{ name: string; qty: number }>;
    barcodeData?: string;
  }): Promise<PrinterProviderResult>;

  printBatchLabel(params: {
    productName: string;
    batchNumber: string;
    expiryDate: string;
    mrp: string;
    barcode?: string;
  }): Promise<boolean>;

  printBatchLabelDetailed(params: {
    productName: string;
    batchNumber: string;
    expiryDate: string;
    mrp: string;
    barcode?: string;
  }): Promise<PrinterProviderResult>;

  generateDispatchLabelZpl(params: {
    orderId: number;
    customerName: string;
    address: string;
    phone: string;
    items: Array<{ name: string; qty: number }>;
    barcodeData?: string;
  }): string;

  generateBatchLabelZpl(params: {
    productName: string;
    batchNumber: string;
    expiryDate: string;
    mrp: string;
    barcode?: string;
  }): string;
}

/**
 * Label printer connector — ZPL (Zebra Printer Language) with Code 128 barcodes.
 * Required env vars (production):
 *   PRINTER_HOST — IP address of the thermal label printer
 *   PRINTER_PORT — TCP port (default: 9100)
 */
export const labelPrinterConnector: LabelPrinterConnector = {
  generateDispatchLabelZpl({
    orderId,
    customerName,
    address,
    phone,
    items,
    barcodeData,
  }) {
    const barcode = barcodeData ?? `ORD-${orderId}`;
    const itemsText = items
      .map(i => `${i.name} x${i.qty}`)
      .join(", ")
      .substring(0, 60);

    return `^XA
^PW812
^LL406
^FO30,20^A0N,35,35^FD24/7 Pharmacy^FS
^FO30,60^A0N,22,22^FDOrder ORD-${String(orderId).padStart(6, "0")}^FS
^FO30,90^GB752,2,2^FS
^FO30,100^A0N,28,28^FD${customerName.substring(0, 30)}^FS
^FO30,135^A0N,20,20^FD${address.substring(0, 50)}^FS
^FO30,160^A0N,18,18^FDPh: ${phone}^FS
^FO30,185^GB752,2,2^FS
^FO30,195^A0N,18,18^FD${itemsText}^FS
^FO30,230^BCN,80,Y,N,N^FD${barcode}^FS
^XZ`;
  },

  generateBatchLabelZpl({
    productName,
    batchNumber,
    expiryDate,
    mrp,
    barcode,
  }) {
    const bc = barcode ?? batchNumber;

    return `^XA
^PW406
^LL203
^FO10,10^A0N,22,22^FD${productName.substring(0, 25)}^FS
^FO10,38^A0N,18,18^FDBatch: ${batchNumber}^FS
^FO10,60^A0N,18,18^FDExp: ${expiryDate}  MRP: Rs.${mrp}^FS
^FO10,85^BCN,70,Y,N,N^FD${bc}^FS
^XZ`;
  },

  async printDispatchLabel(params) {
    const result = await this.printDispatchLabelDetailed(params);
    return result.status === "printed";
  },

  async printDispatchLabelDetailed(params) {
    const zpl = this.generateDispatchLabelZpl(params);
    const host = process.env.PRINTER_HOST;
    const port = parseInt(process.env.PRINTER_PORT ?? "9100", 10);

    if (!host) {
      const result = providerUnavailableResult<
        "provider_unconfigured" | "skipped_demo"
      >("Label printer", ["PRINTER_HOST"]);

      if (result.status === "skipped_demo") {
        console.log(
          `[Printer DEMO SKIPPED] Dispatch label for order #${params.orderId}:\n${zpl}`,
        );
      }

      return { ...result, zpl };
    }

    try {
      const net = await import("net");

      await new Promise<void>((resolve, reject) => {
        const socket = net.createConnection(port, host, () => {
          socket.write(zpl, "utf8", () => {
            socket.end();
            resolve();
          });
        });

        socket.on("error", reject);
        socket.setTimeout(5000, () => {
          socket.destroy();
          reject(new Error("Printer timeout"));
        });
      });

      return { status: "printed", ok: true, zpl };
    } catch (err) {
      console.error("[Printer] Failed to send dispatch label:", err);

      return {
        status: "failed",
        ok: false,
        reason: "Printer delivery failed",
        zpl,
      };
    }
  },

  async printBatchLabel(params) {
    const result = await this.printBatchLabelDetailed(params);
    return result.status === "printed";
  },

  async printBatchLabelDetailed(params) {
    const zpl = this.generateBatchLabelZpl(params);
    const host = process.env.PRINTER_HOST;
    const port = parseInt(process.env.PRINTER_PORT ?? "9100", 10);

    if (!host) {
      const result = providerUnavailableResult<
        "provider_unconfigured" | "skipped_demo"
      >("Label printer", ["PRINTER_HOST"]);

      if (result.status === "skipped_demo") {
        console.log(
          `[Printer DEMO SKIPPED] Batch label for ${params.productName}:\n${zpl}`,
        );
      }

      return { ...result, zpl };
    }

    try {
      const net = await import("net");

      await new Promise<void>((resolve, reject) => {
        const socket = net.createConnection(port, host, () => {
          socket.write(zpl, "utf8", () => {
            socket.end();
            resolve();
          });
        });

        socket.on("error", reject);
        socket.setTimeout(5000, () => {
          socket.destroy();
          reject(new Error("Printer timeout"));
        });
      });

      return { status: "printed", ok: true, zpl };
    } catch (err) {
      console.error("[Printer] Failed to send batch label:", err);

      return {
        status: "failed",
        ok: false,
        reason: "Printer delivery failed",
        zpl,
      };
    }
  },
};

// ─── ERP Sync Connector ───────────────────────────────────────────────────────

export interface ErpSyncConnector {
  pushGrn(params: {
    ingestionId: number;
    storeId: number;
    items: Array<{
      productName: string;
      batchNumber: string;
      qty: number;
      unitCost: number;
      mrp: number;
    }>;
  }): Promise<ErpProviderResult>;

  pushSalesOrder(params: {
    orderId: number;
    storeId: number;
    totalAmount: number;
    items: Array<{
      productName: string;
      qty: number;
      unitPrice: number;
      hsnCode?: string;
      gstRate?: number;
    }>;
  }): Promise<ErpProviderResult>;
}

/**
 * ERP sync connector — Tally/SAP REST adapter.
 * Required env vars:
 *   ERP_BASE_URL    — Base URL of the ERP API
 *   ERP_API_KEY     — API key for ERP authentication
 *   ERP_COMPANY_ID  — Company/tenant identifier in ERP
 */
export const erpConnector: ErpSyncConnector = {
  async pushGrn({ ingestionId, storeId, items }) {
    const baseUrl = process.env.ERP_BASE_URL;
    const apiKey = process.env.ERP_API_KEY;
    const companyId = process.env.ERP_COMPANY_ID;

    const missing = [
      ...(!baseUrl ? ["ERP_BASE_URL"] : []),
      ...(!apiKey ? ["ERP_API_KEY"] : []),
    ];

    if (missing.length > 0) {
      const result = providerUnavailableResult<
        "provider_unconfigured" | "skipped_demo"
      >("ERP", missing);

      if (result.status === "skipped_demo") {
        console.log(
          `[ERP DEMO SKIPPED] Push GRN for ingestion #${ingestionId}, store #${storeId}, ${items.length} items`,
        );
      }

      return { ...result, erpRef: null };
    }

    try {
      const res = await fetch(`${baseUrl}/grn`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
          ...(companyId ? { "X-Company-ID": companyId } : {}),
        },
        body: JSON.stringify({ ingestionId, storeId, items }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`[ERP] pushGrn error: ${res.status} ${text}`);

        return {
          erpRef: null,
          status: "failed",
          ok: false,
          reason: `ERP GRN sync failed: ${res.status}`,
        };
      }

      const data = (await res.json()) as { ref?: string; status?: string };

      return {
        erpRef: data.ref ?? `GRN-${ingestionId}`,
        status: "synced",
        ok: true,
        reason: data.status,
      };
    } catch (err) {
      console.error("[ERP] pushGrn failed:", err);

      return {
        erpRef: null,
        status: "failed",
        ok: false,
        reason: "ERP GRN sync failed",
      };
    }
  },

  async pushSalesOrder({ orderId, storeId, totalAmount, items }) {
    const baseUrl = process.env.ERP_BASE_URL;
    const apiKey = process.env.ERP_API_KEY;
    const companyId = process.env.ERP_COMPANY_ID;

    const missing = [
      ...(!baseUrl ? ["ERP_BASE_URL"] : []),
      ...(!apiKey ? ["ERP_API_KEY"] : []),
    ];

    if (missing.length > 0) {
      const result = providerUnavailableResult<
        "provider_unconfigured" | "skipped_demo"
      >("ERP", missing);

      if (result.status === "skipped_demo") {
        console.log(
          `[ERP DEMO SKIPPED] Push sales order #${orderId}, store #${storeId}, ₹${totalAmount}`,
        );
      }

      return { ...result, erpRef: null };
    }

    try {
      const res = await fetch(`${baseUrl}/sales-orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
          ...(companyId ? { "X-Company-ID": companyId } : {}),
        },
        body: JSON.stringify({ orderId, storeId, totalAmount, items }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`[ERP] pushSalesOrder error: ${res.status} ${text}`);

        return {
          erpRef: null,
          status: "failed",
          ok: false,
          reason: `ERP sales order sync failed: ${res.status}`,
        };
      }

      const data = (await res.json()) as { ref?: string; status?: string };

      return {
        erpRef: data.ref ?? `SO-${orderId}`,
        status: "synced",
        ok: true,
        reason: data.status,
      };
    } catch (err) {
      console.error("[ERP] pushSalesOrder failed:", err);

      return {
        erpRef: null,
        status: "failed",
        ok: false,
        reason: "ERP sales order sync failed",
      };
    }
  },
};