/**
 * External Service Connectors
 *
 * Typed interfaces and real implementations for all external integrations.
 * Each connector reads credentials from environment variables and falls back
 * to a no-op stub when credentials are absent (safe for dev/demo environments).
 *
 * Connectors:
 *   - SMS / WhatsApp (MSG91 + WhatsApp Cloud API)
 *   - Payment Gateway (Razorpay — real SDK integration)
 *   - Label Printer (ZPL for thermal printers)
 *   - ERP Sync (Tally/SAP stub)
 */

import crypto from "crypto";
import { notifyOwner } from "./_core/notification";
import type { NotificationPayload } from "./notifications";

// ─── SMS / WhatsApp Connector ─────────────────────────────────────────────────

export interface SmsConnector {
  sendSms(params: { phone: string; message: string }): Promise<boolean>;
  sendWhatsApp(params: {
    phone: string;
    templateName: string;
    variables: string[];
  }): Promise<boolean>;
}

/**
 * MSG91 SMS connector.
 * Required env vars:
 *   SMS_PROVIDER_API_KEY   — MSG91 auth key
 *   SMS_SENDER_ID          — DLT-approved sender ID (e.g. PHRMCY)
 *   WHATSAPP_PHONE_NUMBER_ID — WhatsApp Business phone number ID
 *   WHATSAPP_API_TOKEN       — WhatsApp Cloud API token
 */
export const smsConnector: SmsConnector = {
  async sendSms({ phone, message }) {
    const apiKey = process.env.SMS_PROVIDER_API_KEY;
    const senderId = process.env.SMS_SENDER_ID ?? "PHRMCY";

    if (!apiKey) {
      console.log(`[SMS STUB] To: ${phone} | Message: ${message}`);
      return true;
    }

    try {
      // Normalize phone: ensure 91 prefix for India
      const normalizedPhone = phone.replace(/^\+/, "").replace(/^0/, "");
      const mobileWithCountry = normalizedPhone.startsWith("91")
        ? normalizedPhone
        : `91${normalizedPhone}`;

      const payload = {
        sender: senderId,
        route: "4", // Transactional route
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
        return false;
      }
      return true;
    } catch (err) {
      console.error("[SMS] Failed to send via MSG91:", err);
      return false;
    }
  },

  async sendWhatsApp({ phone, templateName, variables }) {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const token = process.env.WHATSAPP_API_TOKEN;

    if (!phoneNumberId || !token) {
      console.log(
        `[WhatsApp STUB] To: ${phone} | Template: ${templateName} | Vars: ${variables.join(", ")}`
      );
      return true;
    }

    try {
      const normalizedPhone = phone.replace(/^\+/, "").replace(/^0/, "");
      const to = normalizedPhone.startsWith("91") ? normalizedPhone : `91${normalizedPhone}`;

      const body = {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: "en" },
          components: variables.length > 0 ? [
            {
              type: "body",
              parameters: variables.map(v => ({ type: "text", text: v })),
            },
          ] : [],
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
        }
      );

      if (!res.ok) {
        const text = await res.text();
        console.error(`[WhatsApp] Cloud API error: ${res.status} ${text}`);
        return false;
      }
      return true;
    } catch (err) {
      console.error("[WhatsApp] Failed to send:", err);
      return false;
    }
  },
};

/**
 * Sends a customer notification via SMS and optionally WhatsApp.
 * Falls back to owner notification if SMS fails.
 */
export async function sendCustomerNotification(
  phone: string,
  payload: NotificationPayload
): Promise<void> {
  const message = `${payload.title}\n${payload.content}`;
  const sent = await smsConnector.sendSms({ phone, message });
  if (!sent) {
    // Fallback: notify owner so ops team can manually reach out
    await notifyOwner({
      title: `[FALLBACK] Customer notification failed`,
      content: `Phone: ${phone} | ${payload.title}`,
    });
  }
}

// ─── Payment Gateway Connector ────────────────────────────────────────────────

export interface PaymentGatewayConnector {
  createOrder(params: {
    amount: number; // in paise (INR × 100)
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
    amount?: number; // partial refund if specified
    reason?: string;
  }): Promise<{ refundId: string; status: string }>;
}

/**
 * Razorpay payment connector — real SDK integration.
 * Required env vars:
 *   RAZORPAY_KEY_ID     — Razorpay API key ID
 *   RAZORPAY_KEY_SECRET — Razorpay API key secret
 *
 * Falls back to stub when credentials are absent.
 */
export const paymentConnector: PaymentGatewayConnector = {
  async createOrder({ amount, currency, receipt, notes }) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      console.log(`[Payment STUB] Create order: ₹${amount / 100} | Receipt: ${receipt}`);
      return {
        gatewayOrderId: `stub_order_${Date.now()}`,
        amount,
        currency,
      };
    }

    try {
      // Dynamic import to avoid issues when credentials are absent
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
        amount: typeof order.amount === "number" ? order.amount : parseInt(String(order.amount)),
        currency: order.currency,
      };
    } catch (err) {
      console.error("[Payment] Razorpay createOrder failed:", err);
      throw new Error("Payment gateway error. Please try again.");
    }
  },

  async verifyPayment({ gatewayOrderId, gatewayPaymentId, signature }) {
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    const localDemoMode = ["1", "true", "yes"].includes(String(process.env.LOCAL_DEMO_MODE ?? "").toLowerCase())
      || ["development", "test"].includes(String(process.env.NODE_ENV ?? "").toLowerCase());

    if (!keySecret) {
      if (localDemoMode) return false;
      throw new Error("Payment verification unavailable: RAZORPAY_KEY_SECRET missing");
    }

    // Razorpay HMAC-SHA256 signature verification
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
      console.log(`[Payment STUB] Refund: ${gatewayPaymentId} | Amount: ${amount ?? "full"}`);
      return { refundId: `stub_refund_${Date.now()}`, status: "processed" };
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

  printBatchLabel(params: {
    productName: string;
    batchNumber: string;
    expiryDate: string;
    mrp: string;
    barcode?: string;
  }): Promise<boolean>;

  /** Generate ZPL string without sending to printer (for preview/download) */
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
 * Required env vars (optional — falls back to logging):
 *   PRINTER_HOST — IP address of the thermal label printer
 *   PRINTER_PORT — TCP port (default: 9100)
 */
export const labelPrinterConnector: LabelPrinterConnector = {
  generateDispatchLabelZpl({ orderId, customerName, address, phone, items, barcodeData }) {
    const barcode = barcodeData ?? `ORD-${orderId}`;
    const itemsText = items.map(i => `${i.name} x${i.qty}`).join(", ").substring(0, 60);
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

  generateBatchLabelZpl({ productName, batchNumber, expiryDate, mrp, barcode }) {
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
    const zpl = this.generateDispatchLabelZpl(params);
    const host = process.env.PRINTER_HOST;
    const port = parseInt(process.env.PRINTER_PORT ?? "9100");

    if (!host) {
      console.log(`[Printer STUB] Dispatch label for order #${params.orderId}:\n${zpl}`);
      return true;
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
        socket.setTimeout(5000, () => { socket.destroy(); reject(new Error("Printer timeout")); });
      });
      return true;
    } catch (err) {
      console.error("[Printer] Failed to send dispatch label:", err);
      return false;
    }
  },

  async printBatchLabel(params) {
    const zpl = this.generateBatchLabelZpl(params);
    const host = process.env.PRINTER_HOST;
    const port = parseInt(process.env.PRINTER_PORT ?? "9100");

    if (!host) {
      console.log(`[Printer STUB] Batch label for ${params.productName}:\n${zpl}`);
      return true;
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
        socket.setTimeout(5000, () => { socket.destroy(); reject(new Error("Printer timeout")); });
      });
      return true;
    } catch (err) {
      console.error("[Printer] Failed to send batch label:", err);
      return false;
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
  }): Promise<{ erpRef: string; status: string }>;

  pushSalesOrder(params: {
    orderId: number;
    storeId: number;
    totalAmount: number;
    items: Array<{ productName: string; qty: number; unitPrice: number; hsnCode?: string; gstRate?: number }>;
  }): Promise<{ erpRef: string; status: string }>;
}

/**
 * ERP sync connector — Tally XML / REST stub.
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

    if (!baseUrl || !apiKey) {
      console.log(
        `[ERP STUB] Push GRN for ingestion #${ingestionId}, store #${storeId}, ${items.length} items`
      );
      return { erpRef: `GRN-${ingestionId}-${Date.now()}`, status: "synced" };
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
      const data = await res.json() as { ref?: string; status?: string };
      return {
        erpRef: data.ref ?? `GRN-${ingestionId}`,
        status: data.status ?? "synced",
      };
    } catch (err) {
      console.error("[ERP] pushGrn failed:", err);
      return { erpRef: `GRN-${ingestionId}-${Date.now()}`, status: "error" };
    }
  },

  async pushSalesOrder({ orderId, storeId, totalAmount, items }) {
    const baseUrl = process.env.ERP_BASE_URL;
    const apiKey = process.env.ERP_API_KEY;
    const companyId = process.env.ERP_COMPANY_ID;

    if (!baseUrl || !apiKey) {
      console.log(`[ERP STUB] Push sales order #${orderId}, store #${storeId}, ₹${totalAmount}`);
      return { erpRef: `SO-${orderId}-${Date.now()}`, status: "synced" };
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
      const data = await res.json() as { ref?: string; status?: string };
      return {
        erpRef: data.ref ?? `SO-${orderId}`,
        status: data.status ?? "synced",
      };
    } catch (err) {
      console.error("[ERP] pushSalesOrder failed:", err);
      return { erpRef: `SO-${orderId}-${Date.now()}`, status: "error" };
    }
  },
};
