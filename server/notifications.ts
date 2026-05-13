/**
 * Notification Templates
 *
 * Typed notification templates for every customer-facing event in the
 * order lifecycle. Each template returns a { title, content } pair
 * suitable for passing to notifyOwner() or the connector layer.
 *
 * Templates are intentionally kept as pure functions (no side effects)
 * so they can be unit-tested without a database connection.
 *
 * To send a notification, import the template and pass the result to
 * the appropriate connector (see server/connectors.ts).
 */

import { notifyOwner } from "./_core/notification";

// ─── Template Types ───────────────────────────────────────────────────────────

export interface NotificationPayload {
  title: string;
  content: string;
}

// ─── Customer Notification Templates ─────────────────────────────────────────

/**
 * Sent immediately after a customer places an order.
 */
export function tplOrderReceived(params: {
  orderId: number;
  customerName: string;
  itemCount: number;
  totalAmount: string;
  storeName: string;
}): NotificationPayload {
  return {
    title: `Order #${params.orderId} confirmed`,
    content: `Hi ${params.customerName}, your order of ${params.itemCount} item(s) worth ₹${params.totalAmount} has been received by ${params.storeName}. We'll notify you once it's being prepared.`,
  };
}

/**
 * Sent when a prescription is submitted and enters pharmacist review.
 */
export function tplRxUnderReview(params: {
  customerName: string;
  prescriptionId: number;
  orderId?: number;
}): NotificationPayload {
  const orderRef = params.orderId ? ` for order #${params.orderId}` : "";
  return {
    title: "Prescription under review",
    content: `Hi ${params.customerName}, your prescription (Rx #${params.prescriptionId})${orderRef} is being reviewed by our licensed pharmacist. This usually takes 10–15 minutes.`,
  };
}

/**
 * Sent when a pharmacist approves a prescription.
 */
export function tplRxApproved(params: {
  customerName: string;
  prescriptionId: number;
  orderId?: number;
  pharmacistName?: string;
}): NotificationPayload {
  const orderRef = params.orderId ? ` for order #${params.orderId}` : "";
  const pharmacistRef = params.pharmacistName
    ? ` by ${params.pharmacistName}`
    : "";
  return {
    title: "Prescription approved",
    content: `Hi ${params.customerName}, your prescription (Rx #${params.prescriptionId})${orderRef} has been approved${pharmacistRef}. Your order is now being prepared for dispatch.`,
  };
}

/**
 * Sent when a pharmacist rejects a prescription.
 */
export function tplRxRejected(params: {
  customerName: string;
  prescriptionId: number;
  reason?: string;
  orderId?: number;
}): NotificationPayload {
  const orderRef = params.orderId ? ` for order #${params.orderId}` : "";
  const reasonText = params.reason ? ` Reason: ${params.reason}.` : "";
  return {
    title: "Prescription could not be processed",
    content: `Hi ${params.customerName}, we were unable to process your prescription (Rx #${params.prescriptionId})${orderRef}.${reasonText} Please contact our pharmacist for assistance or upload a clearer image.`,
  };
}

/**
 * Sent when a rider picks up the order and is on the way.
 */
export function tplOutForDelivery(params: {
  customerName: string;
  orderId: number;
  riderName: string;
  etaMinutes?: number;
}): NotificationPayload {
  const etaText = params.etaMinutes
    ? ` Estimated arrival: ${params.etaMinutes} minutes.`
    : "";
  return {
    title: `Order #${params.orderId} is on its way`,
    content: `Hi ${params.customerName}, your order is out for delivery with ${params.riderName}.${etaText} Please keep your phone handy.`,
  };
}

/**
 * Sent when the rider marks the order as delivered.
 */
export function tplDelivered(params: {
  customerName: string;
  orderId: number;
  deliveredAt?: Date;
}): NotificationPayload {
  const timeRef = params.deliveredAt
    ? ` at ${params.deliveredAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
    : "";
  return {
    title: `Order #${params.orderId} delivered`,
    content: `Hi ${params.customerName}, your order has been delivered${timeRef}. Thank you for choosing 24/7 Pharmacy. Rate your experience in the app.`,
  };
}

/**
 * Sent as a refill reminder for a recurring medication.
 */
export function tplRefillReminder(params: {
  customerName: string;
  productName: string;
  daysLeft: number;
  reminderId: number;
}): NotificationPayload {
  const urgency =
    params.daysLeft <= 2
      ? "You're almost out"
      : params.daysLeft <= 5
        ? "Running low"
        : "Time to reorder";
  return {
    title: `${urgency}: ${params.productName}`,
    content: `Hi ${params.customerName}, you have approximately ${params.daysLeft} day(s) of ${params.productName} remaining. Tap to reorder now and ensure uninterrupted medication.`,
  };
}

// ─── Owner / Ops Notification Helpers ────────────────────────────────────────

/**
 * Sends an operational alert to the platform owner via the built-in
 * notification channel. Use for high-priority ops events.
 */
export async function sendOpsAlert(
  title: string,
  content: string
): Promise<boolean> {
  return notifyOwner({ title, content });
}

/**
 * Sends a new order alert to the owner.
 */
export async function alertNewOrder(params: {
  orderId: number;
  storeName: string;
  totalAmount: string;
  itemCount: number;
}): Promise<void> {
  await sendOpsAlert(
    `New order #${params.orderId}`,
    `Store: ${params.storeName} | Items: ${params.itemCount} | Total: ₹${params.totalAmount}`
  );
}

/**
 * Sends a low-stock alert to the owner.
 */
export async function alertLowStock(params: {
  productName: string;
  storeName: string;
  currentStock: number;
}): Promise<void> {
  await sendOpsAlert(
    `Low stock: ${params.productName}`,
    `Store: ${params.storeName} | Current stock: ${params.currentStock} units. Please reorder.`
  );
}
