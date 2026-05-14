import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  whatsappLinks,
  whatsappMessages,
  staffHandoffs,
} from "../../drizzle/schema";
import {
  getWhatsappSession,
  upsertWhatsappSession,
  getUserByPhone,
  writeAuditLog,
} from "../db";
import type { ResultSetHeader } from "mysql2";

export async function getDbSafe() {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "DB unavailable",
    });
  return db;
}

export async function resolveUserId(phone: string): Promise<number | null> {
  phone = normalizeWhatsAppPhone(phone);
  const db = await getDb();
  if (!db) return null;
  const link = await db
    .select()
    .from(whatsappLinks)
    .where(
      and(eq(whatsappLinks.phone, phone), eq(whatsappLinks.isActive, true))
    )
    .limit(1);
  if (link[0]?.userId) return link[0].userId;
  const session = await getWhatsappSession(phone);
  if (session?.userId) return session.userId;
  const existingUser = await getUserByPhone(phone);
  if (existingUser?.id) {
    await upsertWhatsappSession(phone, {
      userId: existingUser.id,
      currentFlow: session?.currentFlow ?? "menu",
      flowState: session?.flowState ?? "{}",
    });
    return existingUser.id;
  }
  await upsertWhatsappSession(phone, {
    currentFlow: session?.currentFlow ?? "pending_link",
    flowState: session?.flowState ?? JSON.stringify({ identity: "unlinked" }),
  });
  return null;
}

export async function logMessage(data: {
  phone: string;
  userId?: number | null;
  direction: "inbound" | "outbound";
  messageType?:
    | "text"
    | "image"
    | "document"
    | "audio"
    | "template"
    | "button"
    | "interactive";
  body?: string;
  mediaUrl?: string;
  mediaKey?: string;
  templateName?: string;
  templateParams?: string;
  externalMsgId?: string;
  sessionId?: number;
  flow?: string;
  status?: "received" | "sent" | "delivered" | "read" | "failed";
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(whatsappMessages).values({
    phone: data.phone,
    userId: data.userId ?? null,
    direction: data.direction,
    messageType: data.messageType ?? "text",
    body: data.body ?? null,
    mediaUrl: data.mediaUrl ?? null,
    mediaKey: data.mediaKey ?? null,
    templateName: data.templateName ?? null,
    templateParams: data.templateParams ?? null,
    externalMsgId: data.externalMsgId ?? null,
    sessionId: data.sessionId ?? null,
    flow: data.flow ?? null,
    status: data.status ?? (data.direction === "inbound" ? "received" : "sent"),
  });
}

export function validateWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  const sig = signature.replace(/^sha256=/, "");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(sig, "hex")
    );
  } catch {
    return false;
  }
}

export function formatOrderStatus(order: {
  id: number | string;
  status: string;
  total: string | number;
}): string {
  const labels: Record<string, string> = {
    created: "Order Received ✓",
    pharmacist_reviewing: "Pharmacist Reviewing 🔬",
    picking: "Being Picked 📦",
    out_for_delivery: "Out for Delivery 🛵",
    delivered: "Delivered ✓",
    cancelled: "Cancelled ✗",
  };
  const label = labels[order.status] ?? order.status;
  return `*Order #${order.id}*\nStatus: ${label}\nTotal: ₹${order.total}\n\nReply *hi* for main menu.`;
}

export function formatSearchResults(
  results: {
    availableQty?: number | null;
    requiresPrescription?: boolean | null;
    name: string;
    strength?: string | null;
    form?: string | null;
    sellingPrice: string | number;
  }[]
): string {
  if (!results.length)
    return "No medicines found. Try a different name.\n\nReply *hi* for main menu.";
  const lines = results.slice(0, 5).map((r, i) => {
    const avail = (r.availableQty ?? 0) > 0 ? "✓ Available" : "✗ Out of stock";
    const rx = r.requiresPrescription ? " [Rx]" : "";
    return `${i + 1}. *${r.name}*${rx}\n   ${r.strength ?? ""} ${r.form ?? ""} | ₹${r.sellingPrice} | ${avail}`;
  });
  return `*Search Results:*\n\n${lines.join("\n\n")}\n\nReply with the number to add to cart, or *hi* for menu.`;
}

export function formatCart(
  lines: {
    productName?: string | null;
    productId: string | number;
    qty: number;
    lineTotal: string;
  }[]
): string {
  if (!lines.length) return "Your cart is empty.\n\nReply *hi* for main menu.";
  const items = lines.map(
    (l, i) =>
      `${i + 1}. ${l.productName ?? `Product #${l.productId}`} × ${l.qty} = ₹${l.lineTotal}`
  );
  const total = lines
    .reduce((s, l) => s + parseFloat(l.lineTotal), 0)
    .toFixed(2);
  return `*Your Cart:*\n\n${items.join("\n")}\n\n*Total: ₹${total}*\n\nReply *confirm* to place order, *clear* to empty cart, or *hi* for menu.`;
}

export function isTruthyEnv(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes((value ?? "").toLowerCase());
}

export function normalizeWhatsAppPhone(phone: string) {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return trimmed;
  if (trimmed.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

export function isRegulatedMedicineIntent(message: string) {
  const text = message.toLowerCase();
  return /\b(rx|prescription|schedule\s*(h1|h|x)|h1|dosage|dose|substitute|substitution|side\s*effects?|emergency|adverse|allergy|refill|antibiotic|controlled|narcotic|sleeping\s*pill|painkiller)\b/.test(
    text
  );
}

export function assertWhatsappWebhookGuard(
  ctx: { req?: { header?: (name: string) => string | undefined } },
  payload?: string
) {
  if (process.env.NODE_ENV !== "production") {
    if (
      !isTruthyEnv(process.env.WHATSAPP_DEMO_WEBHOOK_OPEN) &&
      isTruthyEnv(process.env.WHATSAPP_PROVIDER_ENABLED)
    ) {
      // Local/demo calls are intentionally open only outside production; production always verifies below.
    }
    return;
  }

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? "";
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET ?? "";
  if (!verifyToken && !secret) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Webhook verification required",
    });
  }

  const header = (name: string) =>
    ctx.req?.header?.(name) ?? ctx.req?.header?.(name.toLowerCase()) ?? "";
  const incomingToken =
    header("x-webhook-token") ||
    header("x-whatsapp-webhook-token") ||
    header("x-hub-verify-token");
  const incomingSig =
    header("x-hub-signature-256") ||
    header("x-whatsapp-signature") ||
    header("x-signature");
  const rawPayload = payload ?? header("x-raw-body");

  let tokenOk = false;
  if (verifyToken && incomingToken) {
    const incoming = Buffer.from(incomingToken);
    const expected = Buffer.from(verifyToken);
    tokenOk =
      incoming.length === expected.length &&
      crypto.timingSafeEqual(incoming, expected);
  }
  const sigOk = Boolean(
    secret &&
      incomingSig &&
      rawPayload &&
      validateWebhookSignature(rawPayload, incomingSig, secret)
  );
  if (!tokenOk && !sigOk)
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Webhook verification required",
    });
}

export async function createRegulatedIntentHandoff(input: {
  phone: string;
  userId: number | null;
  sessionId?: number;
  message: string;
}) {
  const db = await getDb();
  if (!db) return null;
  const urgent =
    /\b(emergency|side\s*effects?|adverse|allergy|breath|swelling|chest\s*pain)\b/i.test(
      input.message
    );
  const handoffInsert = await db.insert(staffHandoffs).values({
    phone: input.phone,
    userId: input.userId,
    sessionId: input.sessionId ?? null,
    reason: "rx_clarification",
    reasonNote: `Regulated/medical WhatsApp intent requires pharmacist review: "${input.message.slice(0, 240)}"`,
    status: "open",
    priority: urgent ? "urgent" : "high",
  });
  const [handoffHeader] = handoffInsert as unknown as [ResultSetHeader];
  const handoffId = handoffHeader.insertId;
  await writeAuditLog({
    actor: { id: input.userId ?? null, type: "whatsapp" },
    action: "whatsapp.regulated_intent.escalated",
    entityType: "staff_handoff",
    entityId: handoffId,
    payload: JSON.stringify({ phone: input.phone, unlinked: !input.userId }),
  });
  return handoffId;
}
