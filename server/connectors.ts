/**
 * External Service Connectors
 *
 * Typed interfaces and stub implementations for all external integrations.
 * Each connector has a well-defined interface and a no-op default
 * implementation that logs the call. Replace stubs with real implementations
 * by setting the appropriate environment variables and swapping the
 * implementation below.
 *
 * Connectors:
 *   - SMS / WhatsApp (customer notifications)
 *   - Payment Gateway (Razorpay)
 *   - Label Printer (ZPL for thermal printers)
 *   - ERP Sync (stub for Tally/SAP integration)
 */

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
 * Default SMS connector — logs to console and sends owner notification.
 * TODO: Replace with Twilio / Gupshup / MSG91 SDK when credentials are ready.
 *   Required env vars:
 *     SMS_PROVIDER_API_KEY   — API key for SMS provider
 *     SMS_SENDER_ID          — Registered sender ID (DLT approved)
 *     WHATSAPP_BUSINESS_ID   — WhatsApp Business Account ID
 *     WHATSAPP_API_TOKEN     — WhatsApp Cloud API token
 */
export const smsConnector: SmsConnector = {
  async sendSms({ phone, message }) {
    console.log(`[SMS STUB] To: ${phone} | Message: ${message}`);
    // TODO: Integrate with MSG91 / Twilio
    // const response = await fetch("https://api.msg91.com/api/v5/flow/", { ... });
    return true;
  },

  async sendWhatsApp({ phone, templateName, variables }) {
    console.log(
      `[WhatsApp STUB] To: ${phone} | Template: ${templateName} | Vars: ${variables.join(", ")}`
    );
    // TODO: Integrate with WhatsApp Cloud API
    // POST https://graph.facebook.com/v18.0/{phone_number_id}/messages
    return true;
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
 * Default payment gateway connector — Razorpay stub.
 * TODO: Replace with live Razorpay SDK.
 *   Required env vars:
 *     RAZORPAY_KEY_ID     — Razorpay API key ID
 *     RAZORPAY_KEY_SECRET — Razorpay API key secret
 */
export const paymentConnector: PaymentGatewayConnector = {
  async createOrder({ amount, currency, receipt, notes }) {
    console.log(
      `[Payment STUB] Create order: ₹${amount / 100} | Receipt: ${receipt}`
    );
    // TODO: const razorpay = new Razorpay({ key_id, key_secret });
    // return razorpay.orders.create({ amount, currency, receipt, notes });
    return {
      gatewayOrderId: `stub_order_${Date.now()}`,
      amount,
      currency,
    };
  },

  async verifyPayment({ gatewayOrderId, gatewayPaymentId, signature }) {
    console.log(
      `[Payment STUB] Verify: ${gatewayOrderId} | Payment: ${gatewayPaymentId}`
    );
    // TODO: Use crypto.createHmac to verify Razorpay signature
    // const expectedSignature = crypto.createHmac("sha256", key_secret)
    //   .update(`${gatewayOrderId}|${gatewayPaymentId}`).digest("hex");
    // return expectedSignature === signature;
    return true;
  },

  async refund({ gatewayPaymentId, amount, reason }) {
    console.log(
      `[Payment STUB] Refund: ${gatewayPaymentId} | Amount: ${amount ?? "full"} | Reason: ${reason}`
    );
    // TODO: razorpay.payments.refund(gatewayPaymentId, { amount, notes: { reason } });
    return { refundId: `stub_refund_${Date.now()}`, status: "processed" };
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
}

/**
 * Default label printer connector — ZPL (Zebra Printer Language) stub.
 * TODO: Replace with actual ZPL generation + network print queue.
 *   Required env vars:
 *     PRINTER_HOST — IP address of the thermal label printer
 *     PRINTER_PORT — TCP port (default: 9100)
 */
export const labelPrinterConnector: LabelPrinterConnector = {
  async printDispatchLabel({ orderId, customerName, address, items }) {
    const zpl = `
^XA
^FO50,50^A0N,30,30^FDOrder #${orderId}^FS
^FO50,90^A0N,25,25^FD${customerName}^FS
^FO50,120^A0N,20,20^FD${address}^FS
^FO50,160^A0N,20,20^FDItems: ${items.map((i) => `${i.name} x${i.qty}`).join(", ")}^FS
^XZ`.trim();

    console.log(`[Printer STUB] Dispatch label for order #${orderId}:\n${zpl}`);
    // TODO: Send ZPL to printer via TCP socket
    // const socket = net.createConnection(PRINTER_PORT, PRINTER_HOST);
    // socket.write(zpl); socket.end();
    return true;
  },

  async printBatchLabel({ productName, batchNumber, expiryDate, mrp }) {
    const zpl = `
^XA
^FO50,50^A0N,25,25^FD${productName}^FS
^FO50,85^A0N,20,20^FDBatch: ${batchNumber}^FS
^FO50,110^A0N,20,20^FDExp: ${expiryDate} | MRP: ${mrp}^FS
^XZ`.trim();

    console.log(`[Printer STUB] Batch label for ${productName}:\n${zpl}`);
    return true;
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
    items: Array<{ productName: string; qty: number; unitPrice: number }>;
  }): Promise<{ erpRef: string; status: string }>;
}

/**
 * Default ERP sync connector — stub for Tally/SAP integration.
 * TODO: Replace with actual ERP API calls.
 *   Required env vars:
 *     ERP_BASE_URL    — Base URL of the ERP API
 *     ERP_API_KEY     — API key for ERP authentication
 *     ERP_COMPANY_ID  — Company/tenant identifier in ERP
 */
export const erpConnector: ErpSyncConnector = {
  async pushGrn({ ingestionId, storeId, items }) {
    console.log(
      `[ERP STUB] Push GRN for ingestion #${ingestionId}, store #${storeId}, ${items.length} items`
    );
    // TODO: POST to ERP GRN endpoint
    // await fetch(`${ERP_BASE_URL}/grn`, { method: "POST", body: JSON.stringify({ ... }) });
    return { erpRef: `GRN-${ingestionId}-${Date.now()}`, status: "synced" };
  },

  async pushSalesOrder({ orderId, storeId, totalAmount }) {
    console.log(
      `[ERP STUB] Push sales order #${orderId}, store #${storeId}, ₹${totalAmount}`
    );
    // TODO: POST to ERP sales order endpoint
    return { erpRef: `SO-${orderId}-${Date.now()}`, status: "synced" };
  },
};
