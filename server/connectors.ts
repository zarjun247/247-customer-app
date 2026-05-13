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
import { makeCircuitBreaker } from "./_core/circuitBreaker";

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
    process.env.PROVIDER_DEMO_MODE ?? process.env.DEMO_MODE ?? ""
  ).toLowerCase();

  return (
    ["1", "true", "yes", "on", "demo", "local"].includes(explicit) ||
    ["development", "test"].includes(
      String(process.env.NODE_ENV ?? "").toLowerCase()
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

const _smsFetch = makeCircuitBreaker(
  "sms",
  async (
    signal: AbortSignal,
    mobileWithCountry: string,
    apiKey: string,
    senderId: string,
    message: string
  ): Promise<MessageProviderResult> => {
    const payload = {
      sender: senderId,
      route: "4",
      country: "91",
      sms: [{ message, to: [mobileWithCountry] }],
    };
    const res = await fetch("https://api.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: { "Content-Type": "application/json", authkey: apiKey },
      body: JSON.stringify(payload),
      signal,
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
  },
  { timeoutMs: 8_000 }
);

const _whatsappFetch = makeCircuitBreaker(
  "whatsapp",
  async (
    signal: AbortSignal,
    phoneNumberId: string,
    token: string,
    body: Record<string, unknown>
  ): Promise<MessageProviderResult> => {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        signal,
      }
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
  },
  { timeoutMs: 5_000 }
);

const _razorpayCreate = makeCircuitBreaker(
  "razorpay.createOrder",
  async (
    signal: AbortSignal,
    params: {
      amount: number;
      currency: string;
      receipt: string;
      notes?: Record<string, string>;
    }
  ): Promise<{ id: string; amount: number | string; currency: string }> => {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret)
      throw new Error(
        "Payment provider_unconfigured: RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET missing"
      );
    const Razorpay = (await import("razorpay")).default;
    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
    return Promise.race([
      rzp.orders.create(params),
      new Promise<never>((_, reject) =>
        signal.addEventListener("abort", () =>
          reject(new Error("razorpay.createOrder timed out"))
        )
      ),
    ]);
  },
  { timeoutMs: 10_000 }
);

const _razorpayRefund = makeCircuitBreaker(
  "razorpay.refund",
  async (
    signal: AbortSignal,
    gatewayPaymentId: string,
    opts: { amount?: number; notes?: { reason?: string } }
  ): Promise<{ id: string; status: string }> => {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret)
      throw new Error("Payment refund unavailable: provider_unconfigured");
    const Razorpay = (await import("razorpay")).default;
    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
    return Promise.race([
      rzp.payments.refund(gatewayPaymentId, opts),
      new Promise<never>((_, reject) =>
        signal.addEventListener("abort", () =>
          reject(new Error("razorpay.refund timed out"))
        )
      ),
    ]);
  },
  { timeoutMs: 10_000 }
);

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
      return await _smsFetch(mobileWithCountry, apiKey, senderId, message);
    } catch (err) {
      console.error("[SMS] Failed to send via MSG91:", err);
      return { status: "failed", ok: false, reason: "MSG91 request failed" };
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
          `[WhatsApp DEMO SKIPPED] To: ${phone} | Template: ${templateName} | Vars: ${variables.join(", ")}`
        );
      }

      return result;
    }

    try {
      const normalizedPhone = phone.replace(/^\+/, "").replace(/^0/, "");
      const to = normalizedPhone.startsWith("91")
        ? normalizedPhone
        : `91${normalizedPhone}`;

      const body: Record<string, unknown> = {
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
                    parameters: variables.map(v => ({ type: "text", text: v })),
                  },
                ]
              : [],
        },
      };

      return await _whatsappFetch(phoneNumberId!, token!, body);
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
  payload: NotificationPayload
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
    process.env.PAYMENT_PROVIDER_MODE ?? process.env.LOCAL_DEMO_MODE ?? ""
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
    try {
      const order = await _razorpayCreate({ amount, currency, receipt, notes });
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

  verifyPayment({
    gatewayOrderId,
    gatewayPaymentId,
    signature,
  }): Promise<boolean> {
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keySecret) {
      if (isExplicitPaymentDemoMode()) return Promise.resolve(false);

      return Promise.reject(
        new Error("Payment provider_unconfigured: RAZORPAY_KEY_SECRET missing")
      );
    }

    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${gatewayOrderId}|${gatewayPaymentId}`)
      .digest("hex");

    return Promise.resolve(expectedSignature === signature);
  },

  async refund({ gatewayPaymentId, amount, reason }) {
    try {
      const refund = await _razorpayRefund(gatewayPaymentId, {
        amount,
        notes: reason ? { reason } : undefined,
      });
      return { refundId: refund.id, status: refund.status };
    } catch (err) {
      console.error("[Payment] Razorpay refund failed:", err);
      throw new Error("Refund failed. Please contact support.");
    }
  },
};

export * from "./connectors-peripheral";
