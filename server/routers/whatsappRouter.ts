/**
 * PART 10: WhatsApp Full Channel Router
 *
 * All WhatsApp orders write to the same order/sale objects as app/counter.
 * No shadow order book. sourceChannel = "whatsapp" on all created orders.
 *
 * Features:
 *  - Phone ↔ userId linking with OTP verification
 *  - Full message audit log (whatsapp_messages)
 *  - Webhook signature validation helper
 *  - Real catalogue search (same getCatalog as app)
 *  - WhatsApp cart (whatsapp_carts + whatsapp_cart_lines) → converts to real order
 *  - Rx upload attaches to linked customer (never userId 0)
 *  - Reorder from history
 *  - Refill reminder CTA
 *  - Live order status
 *  - Bill sharing placeholder
 *  - Staff handoff queue
 *  - Delivery exception handling
 *  - Supplier bill import via WhatsApp (triggers OCR ingestion)
 *  - WABA message template CRUD
 *  - Admin: message queue, linked customers, handoffs, recent WA orders, templates
 */

import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, isNull, like, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  whatsappLinks,
  whatsappMessages,
  whatsappCarts,
  whatsappCartLines,
  wabaMessageTemplates,
  staffHandoffs,
  whatsappWebhookLog,
  whatsappSessions,
  orders,
  orderItems,
  products,
  storeSkus,
  productVariants,
  prescriptions,
  users,
  buildings,
  stores,
  refillReminders,
  refillPlans,
  ingestionJobs,
} from "../../drizzle/schema";
import {
  getDb as getDbHelper,
  getWhatsappSession,
  upsertWhatsappSession,
  getCatalog,
  getOrderById,
  getOrdersByUser,
  getOrderItemsForReorder,
  createOrder,
  getUserByPhone,
  upsertUserByPhone,
  writeAuditLog,
  createWhatsappPrescription,
} from "../db";
import crypto from "crypto";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getDbSafe() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return db;
}

/** Resolve userId from phone — first check whatsapp_links, then session, then upsert */
async function resolveUserId(phone: string): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  // 1. Check verified link
  const link = await db.select().from(whatsappLinks)
    .where(and(eq(whatsappLinks.phone, phone), eq(whatsappLinks.isActive, true)))
    .limit(1);
  if (link[0]?.userId) return link[0].userId;
  // 2. Fall back to session
  const session = await getWhatsappSession(phone);
  if (session?.userId) return session.userId;
  return null;
}

/** Log a WhatsApp message to audit table */
async function logMessage(data: {
  phone: string;
  userId?: number | null;
  direction: "inbound" | "outbound";
  messageType?: "text" | "image" | "document" | "audio" | "template" | "button" | "interactive";
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

/** Validate HMAC-SHA256 webhook signature */
function validateWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const sig = signature.replace(/^sha256=/, "");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(sig, "hex"));
  } catch {
    return false;
  }
}

/** Format order status for WhatsApp message */
function formatOrderStatus(order: any): string {
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

/** Format search results for WhatsApp */
function formatSearchResults(results: any[]): string {
  if (!results.length) return "No medicines found. Try a different name.\n\nReply *hi* for main menu.";
  const lines = results.slice(0, 5).map((r, i) => {
    const avail = (r.availableQty ?? 0) > 0 ? "✓ Available" : "✗ Out of stock";
    const rx = r.requiresPrescription ? " [Rx]" : "";
    return `${i + 1}. *${r.name}*${rx}\n   ${r.strength ?? ""} ${r.form ?? ""} | ₹${r.sellingPrice} | ${avail}`;
  });
  return `*Search Results:*\n\n${lines.join("\n\n")}\n\nReply with the number to add to cart, or *hi* for menu.`;
}

/** Format cart for WhatsApp */
function formatCart(lines: any[]): string {
  if (!lines.length) return "Your cart is empty.\n\nReply *hi* for main menu.";
  const items = lines.map((l, i) =>
    `${i + 1}. ${l.productName ?? `Product #${l.productId}`} × ${l.qty} = ₹${l.lineTotal}`
  );
  const total = lines.reduce((s, l) => s + parseFloat(l.lineTotal), 0).toFixed(2);
  return `*Your Cart:*\n\n${items.join("\n")}\n\n*Total: ₹${total}*\n\nReply *confirm* to place order, *clear* to empty cart, or *hi* for menu.`;
}

// ─── Sub-routers ──────────────────────────────────────────────────────────────

// Phone linking
const linkRouter = router({
  /** Link a WhatsApp phone to a userId (staff can do this for walk-in customers) */
  create: protectedProcedure
    .input(z.object({
      phone: z.string().min(10).max(20),
      userId: z.number().int().positive(),
      method: z.enum(["otp", "app_login", "staff_override"]).default("staff_override"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDbSafe();
      // Upsert link
      const existing = await db.select().from(whatsappLinks)
        .where(eq(whatsappLinks.phone, input.phone)).limit(1);
      if (existing[0]) {
        await db.update(whatsappLinks)
          .set({ userId: input.userId, verificationMethod: input.method, verifiedAt: new Date(), isActive: true, linkedBy: ctx.user.id })
          .where(eq(whatsappLinks.phone, input.phone));
      } else {
        await db.insert(whatsappLinks).values({
          phone: input.phone,
          userId: input.userId,
          verificationMethod: input.method,
          verifiedAt: new Date(),
          isActive: true,
          linkedBy: ctx.user.id,
        });
      }
      // Sync session
      await upsertWhatsappSession(input.phone, { userId: input.userId });
      await writeAuditLog({
        actor: { id: ctx.user.id, role: ctx.user.role ?? "staff", type: "user" },
        action: "whatsapp.link.create",
        entityType: "whatsapp_link",
        payload: JSON.stringify({ phone: input.phone, userId: input.userId, method: input.method }),
      });
      return { ok: true };
    }),

  /** Unlink a phone */
  remove: protectedProcedure
    .input(z.object({ phone: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDbSafe();
      await db.update(whatsappLinks).set({ isActive: false })
        .where(eq(whatsappLinks.phone, input.phone));
      await writeAuditLog({
        actor: { id: ctx.user.id, type: "user" },
        action: "whatsapp.link.remove",
        entityType: "whatsapp_link",
        payload: JSON.stringify({ phone: input.phone }),
      });
      return { ok: true };
    }),

  /** List all linked phones (admin) */
  list: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ input }) => {
      const db = await getDbSafe();
      const offset = (input.page - 1) * input.limit;
      const conditions = [eq(whatsappLinks.isActive, true)];
      if (input.search) {
        conditions.push(like(whatsappLinks.phone, `%${input.search}%`));
      }
      const rows = await db.select({
        id: whatsappLinks.id,
        phone: whatsappLinks.phone,
        userId: whatsappLinks.userId,
        verificationMethod: whatsappLinks.verificationMethod,
        verifiedAt: whatsappLinks.verifiedAt,
        userName: users.name,
        userPhone: users.phone,
      })
        .from(whatsappLinks)
        .leftJoin(users, eq(whatsappLinks.userId, users.id))
        .where(and(...conditions))
        .orderBy(desc(whatsappLinks.createdAt))
        .limit(input.limit)
        .offset(offset);
      return { rows };
    }),
});

// WABA Template management
const templateRouter = router({
  list: protectedProcedure
    .input(z.object({
      category: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDbSafe();
      const conditions: any[] = [];
      if (input.category) conditions.push(eq(wabaMessageTemplates.category, input.category as any));
      if (input.isActive !== undefined) conditions.push(eq(wabaMessageTemplates.isActive, input.isActive));
      return db.select().from(wabaMessageTemplates)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(wabaMessageTemplates.category, wabaMessageTemplates.name);
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      category: z.enum(["order_status", "refill_reminder", "rx_received", "delivery_otp",
        "bill_share", "staff_handoff", "delivery_exception", "welcome", "supplier_bill", "custom"]),
      language: z.string().default("en"),
      body: z.string().min(1),
      headerText: z.string().optional(),
      footerText: z.string().optional(),
      buttonLabels: z.array(z.string()).optional(),
      paramCount: z.number().int().min(0).default(0),
      paramDescriptions: z.array(z.string()).optional(),
      wabaTemplateId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDbSafe();
      const [r] = await db.insert(wabaMessageTemplates).values({
        name: input.name,
        category: input.category,
        language: input.language,
        body: input.body,
        headerText: input.headerText ?? null,
        footerText: input.footerText ?? null,
        buttonLabels: input.buttonLabels ? JSON.stringify(input.buttonLabels) : null,
        paramCount: input.paramCount,
        paramDescriptions: input.paramDescriptions ? JSON.stringify(input.paramDescriptions) : null,
        wabaTemplateId: input.wabaTemplateId ?? null,
        wabaStatus: "draft",
        isActive: true,
        createdBy: ctx.user.id,
      });
      return { id: (r as any).insertId as number };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      body: z.string().optional(),
      headerText: z.string().optional(),
      footerText: z.string().optional(),
      wabaTemplateId: z.string().optional(),
      wabaStatus: z.enum(["draft", "pending", "approved", "rejected"]).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDbSafe();
      const update: any = {};
      if (input.body !== undefined) update.body = input.body;
      if (input.headerText !== undefined) update.headerText = input.headerText;
      if (input.footerText !== undefined) update.footerText = input.footerText;
      if (input.wabaTemplateId !== undefined) update.wabaTemplateId = input.wabaTemplateId;
      if (input.wabaStatus !== undefined) update.wabaStatus = input.wabaStatus;
      if (input.isActive !== undefined) update.isActive = input.isActive;
      await db.update(wabaMessageTemplates).set(update).where(eq(wabaMessageTemplates.id, input.id));
      return { ok: true };
    }),

  seed: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDbSafe();
    const defaults = [
      {
        name: "order_confirmed",
        category: "order_status" as const,
        body: "✓ Order #{{1}} confirmed!\nTotal: ₹{{2}}\nEstimated delivery: {{3}} mins\n\nTrack: Reply *status {{1}}*",
        paramCount: 3,
        paramDescriptions: JSON.stringify(["orderId", "total", "etaMins"]),
      },
      {
        name: "order_out_for_delivery",
        category: "order_status" as const,
        body: "🛵 Order #{{1}} is out for delivery!\nRider: {{2}}\nOTP: {{3}}\n\nPlease share OTP with rider on delivery.",
        paramCount: 3,
        paramDescriptions: JSON.stringify(["orderId", "riderName", "otp"]),
      },
      {
        name: "order_delivered",
        category: "order_status" as const,
        body: "✓ Order #{{1}} delivered!\nThank you for choosing 24/7 Pharmacy.\n\nReply *hi* to place a new order.",
        paramCount: 1,
        paramDescriptions: JSON.stringify(["orderId"]),
      },
      {
        name: "rx_received",
        category: "rx_received" as const,
        body: "📋 Prescription received!\nOur pharmacist will review it shortly.\n\nRef: RX-{{1}}\n\nReply *hi* for main menu.",
        paramCount: 1,
        paramDescriptions: JSON.stringify(["prescriptionId"]),
      },
      {
        name: "refill_reminder",
        category: "refill_reminder" as const,
        body: "💊 Refill Reminder\n*{{1}}* is due for refill.\n\nReply *reorder* to reorder, or open the 24/7 app.",
        paramCount: 1,
        paramDescriptions: JSON.stringify(["medicineName"]),
      },
      {
        name: "bill_share",
        category: "bill_share" as const,
        body: "🧾 Bill for Order #{{1}}\nTotal: ₹{{2}}\nDate: {{3}}\n\nDownload: {{4}}",
        paramCount: 4,
        paramDescriptions: JSON.stringify(["orderId", "total", "date", "invoiceUrl"]),
      },
      {
        name: "staff_handoff",
        category: "staff_handoff" as const,
        body: "👋 You're now connected with our team.\n*{{1}}* will assist you shortly.\n\nRef: #{{2}}",
        paramCount: 2,
        paramDescriptions: JSON.stringify(["staffName", "handoffId"]),
      },
      {
        name: "delivery_exception",
        category: "delivery_exception" as const,
        body: "⚠️ Delivery Update for Order #{{1}}\n{{2}}\n\nOur team will contact you shortly. Reply *help* to connect with staff.",
        paramCount: 2,
        paramDescriptions: JSON.stringify(["orderId", "exceptionMessage"]),
      },
      {
        name: "welcome",
        category: "welcome" as const,
        body: "👋 Welcome to 24/7 Pharmacy!\n\nReply with:\n1️⃣ Search medicines\n2️⃣ My orders\n3️⃣ Upload prescription\n4️⃣ Reorder last order\n5️⃣ Refill reminders\n6️⃣ Talk to staff",
        paramCount: 0,
      },
    ];
    let created = 0;
    for (const t of defaults) {
      try {
        await db.insert(wabaMessageTemplates).values({
          ...t,
          language: "en",
          wabaStatus: "draft",
          isActive: true,
          createdBy: ctx.user.id,
        });
        created++;
      } catch {
        // Skip duplicates
      }
    }
    return { created };
  }),
});

// Staff handoff management
const handoffRouter = router({
  list: protectedProcedure
    .input(z.object({
      status: z.enum(["open", "assigned", "resolved", "closed", "all"]).default("open"),
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ input }) => {
      const db = await getDbSafe();
      const offset = (input.page - 1) * input.limit;
      const conditions: any[] = [];
      if (input.status !== "all") conditions.push(eq(staffHandoffs.status, input.status));
      const rows = await db.select({
        id: staffHandoffs.id,
        phone: staffHandoffs.phone,
        userId: staffHandoffs.userId,
        reason: staffHandoffs.reason,
        reasonNote: staffHandoffs.reasonNote,
        status: staffHandoffs.status,
        priority: staffHandoffs.priority,
        assignedTo: staffHandoffs.assignedTo,
        assignedAt: staffHandoffs.assignedAt,
        resolvedAt: staffHandoffs.resolvedAt,
        resolutionNote: staffHandoffs.resolutionNote,
        relatedOrderId: staffHandoffs.relatedOrderId,
        createdAt: staffHandoffs.createdAt,
        customerName: users.name,
      })
        .from(staffHandoffs)
        .leftJoin(users, eq(staffHandoffs.userId, users.id))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(staffHandoffs.createdAt))
        .limit(input.limit)
        .offset(offset);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(staffHandoffs)
        .where(conditions.length ? and(...conditions) : undefined);
      return { rows, total: count };
    }),

  assign: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      staffId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDbSafe();
      await db.update(staffHandoffs)
        .set({ status: "assigned", assignedTo: input.staffId, assignedAt: new Date() })
        .where(eq(staffHandoffs.id, input.id));
      await writeAuditLog({
        actor: { id: ctx.user.id, type: "user" },
        action: "whatsapp.handoff.assign",
        entityType: "staff_handoff",
        entityId: input.id,
        payload: JSON.stringify({ staffId: input.staffId }),
      });
      return { ok: true };
    }),

  resolve: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      resolutionNote: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDbSafe();
      await db.update(staffHandoffs)
        .set({ status: "resolved", resolvedAt: new Date(), resolutionNote: input.resolutionNote ?? null })
        .where(eq(staffHandoffs.id, input.id));
      await writeAuditLog({
        actor: { id: ctx.user.id, type: "user" },
        action: "whatsapp.handoff.resolve",
        entityType: "staff_handoff",
        entityId: input.id,
      });
      return { ok: true };
    }),
});

// Message audit log
const messageRouter = router({
  list: protectedProcedure
    .input(z.object({
      phone: z.string().optional(),
      direction: z.enum(["inbound", "outbound", "all"]).default("all"),
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(200).default(50),
    }))
    .query(async ({ input }) => {
      const db = await getDbSafe();
      const offset = (input.page - 1) * input.limit;
      const conditions: any[] = [];
      if (input.phone) conditions.push(like(whatsappMessages.phone, `%${input.phone}%`));
      if (input.direction !== "all") conditions.push(eq(whatsappMessages.direction, input.direction));
      const rows = await db.select()
        .from(whatsappMessages)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(whatsappMessages.createdAt))
        .limit(input.limit)
        .offset(offset);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(whatsappMessages)
        .where(conditions.length ? and(...conditions) : undefined);
      return { rows, total: count };
    }),
});

// Cart management
const cartRouter = router({
  get: publicProcedure
    .input(z.object({ phone: z.string() }))
    .query(async ({ input }) => {
      const db = await getDbSafe();
      const cart = await db.select().from(whatsappCarts)
        .where(and(eq(whatsappCarts.phone, input.phone), eq(whatsappCarts.status, "active")))
        .orderBy(desc(whatsappCarts.createdAt))
        .limit(1);
      if (!cart[0]) return { cart: null, lines: [] };
      const lines = await db.select({
        id: whatsappCartLines.id,
        productId: whatsappCartLines.productId,
        variantId: whatsappCartLines.variantId,
        storeSkuId: whatsappCartLines.storeSkuId,
        qty: whatsappCartLines.qty,
        unitPrice: whatsappCartLines.unitPrice,
        lineTotal: whatsappCartLines.lineTotal,
        requiresPrescription: whatsappCartLines.requiresPrescription,
        productName: products.name,
      })
        .from(whatsappCartLines)
        .leftJoin(products, eq(whatsappCartLines.productId, products.id))
        .where(eq(whatsappCartLines.cartId, cart[0].id));
      return { cart: cart[0], lines };
    }),

  addItem: publicProcedure
    .input(z.object({
      phone: z.string(),
      storeSkuId: z.number().int().positive(),
      qty: z.number().int().min(1).default(1),
    }))
    .mutation(async ({ input }) => {
      const db = await getDbSafe();
      // Resolve or create active cart
      let cart = (await db.select().from(whatsappCarts)
        .where(and(eq(whatsappCarts.phone, input.phone), eq(whatsappCarts.status, "active")))
        .limit(1))[0];

      const userId = await resolveUserId(input.phone);
      if (!cart) {
        // Get user's store from session/link
        const session = await getWhatsappSession(input.phone);
        const [r] = await db.insert(whatsappCarts).values({
          phone: input.phone,
          userId: userId ?? null,
          storeId: null,
          status: "active",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
        });
        const cartId = (r as any).insertId as number;
        cart = { id: cartId } as any;
      }

      // Get SKU info
      const sku = await db.select({
        id: storeSkus.id,
        productId: storeSkus.productId,
        variantId: storeSkus.variantId,
        sellingPrice: storeSkus.sellingPrice,
        storeId: storeSkus.storeId,
        requiresPrescription: products.requiresPrescription,
        productName: products.name,
      })
        .from(storeSkus)
        .leftJoin(products, eq(storeSkus.productId, products.id))
        .where(eq(storeSkus.id, input.storeSkuId))
        .limit(1);
      if (!sku[0]) throw new TRPCError({ code: "NOT_FOUND", message: "SKU not found" });

      const unitPrice = sku[0].sellingPrice ?? "0";
      const lineTotal = (parseFloat(unitPrice) * input.qty).toFixed(2);

      // Check if already in cart
      const existing = await db.select().from(whatsappCartLines)
        .where(and(eq(whatsappCartLines.cartId, cart.id), eq(whatsappCartLines.storeSkuId, input.storeSkuId)))
        .limit(1);
      if (existing[0]) {
        const newQty = existing[0].qty + input.qty;
        await db.update(whatsappCartLines)
          .set({ qty: newQty, lineTotal: (parseFloat(unitPrice) * newQty).toFixed(2) })
          .where(eq(whatsappCartLines.id, existing[0].id));
      } else {
        await db.insert(whatsappCartLines).values({
          cartId: cart.id,
          productId: sku[0].productId,
          variantId: sku[0].variantId ?? null,
          storeSkuId: input.storeSkuId,
          qty: input.qty,
          unitPrice,
          lineTotal,
          requiresPrescription: sku[0].requiresPrescription ?? false,
        });
      }

      // Update storeId on cart
      if (sku[0].storeId) {
        await db.update(whatsappCarts).set({ storeId: sku[0].storeId }).where(eq(whatsappCarts.id, cart.id));
      }

      return { ok: true, productName: sku[0].productName };
    }),

  clear: publicProcedure
    .input(z.object({ phone: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDbSafe();
      const cart = (await db.select().from(whatsappCarts)
        .where(and(eq(whatsappCarts.phone, input.phone), eq(whatsappCarts.status, "active")))
        .limit(1))[0];
      if (cart) {
        await db.delete(whatsappCartLines).where(eq(whatsappCartLines.cartId, cart.id));
        await db.update(whatsappCarts).set({ status: "abandoned" }).where(eq(whatsappCarts.id, cart.id));
      }
      return { ok: true };
    }),

  confirm: publicProcedure
    .input(z.object({
      phone: z.string(),
      deliveryAddress: z.string().optional(),
      flatNumber: z.string().optional(),
      buildingId: z.number().int().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDbSafe();
      const cart = (await db.select().from(whatsappCarts)
        .where(and(eq(whatsappCarts.phone, input.phone), eq(whatsappCarts.status, "active")))
        .limit(1))[0];
      if (!cart) throw new TRPCError({ code: "NOT_FOUND", message: "No active cart" });

      const lines = await db.select({
        productId: whatsappCartLines.productId,
        variantId: whatsappCartLines.variantId,
        storeSkuId: whatsappCartLines.storeSkuId,
        qty: whatsappCartLines.qty,
        unitPrice: whatsappCartLines.unitPrice,
        lineTotal: whatsappCartLines.lineTotal,
      }).from(whatsappCartLines).where(eq(whatsappCartLines.cartId, cart.id));

      if (!lines.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Cart is empty" });

      const userId = await resolveUserId(input.phone);
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Phone not linked to a customer account. Please link your account first." });

      const storeId = cart.storeId;
      if (!storeId) throw new TRPCError({ code: "BAD_REQUEST", message: "No store assigned to cart" });

      const subtotal = lines.reduce((s, l) => s + parseFloat(l.lineTotal), 0).toFixed(2);
      const total = subtotal; // no discount logic here

      // Create real order using shared engine
      const orderId = await createOrder({
        userId,
        storeId,
        prescriptionId: cart.prescriptionId ?? undefined,
        subtotal,
        total,
        promisedSlaMins: 45,
        deliveryAddress: input.deliveryAddress ?? cart.deliveryAddress ?? undefined,
        flatNumber: input.flatNumber ?? cart.flatNumber ?? undefined,
        buildingId: input.buildingId ?? cart.buildingId ?? undefined,
        source: "whatsapp",
        items: lines.map(l => ({
          productId: l.productId,
          variantId: l.variantId ?? undefined,
          storeSkuId: l.storeSkuId,
          quantity: l.qty,
          unitPrice: l.unitPrice,
          lineTotal: l.lineTotal,
        })),
      });

      // Mark cart confirmed
      await db.update(whatsappCarts)
        .set({ status: "confirmed", convertedOrderId: orderId })
        .where(eq(whatsappCarts.id, cart.id));

      await writeAuditLog({
        actor: { id: userId, type: "whatsapp" },
        action: "whatsapp.cart.confirmed",
        entityType: "order",
        entityId: orderId,
        payload: JSON.stringify({ phone: input.phone, cartId: cart.id }),
      });

      return { ok: true, orderId, total };
    }),
});

// ─── Main webhook handler ─────────────────────────────────────────────────────

const webhookRouter = router({
  /** Validate webhook signature (utility for WABA provider integration) */
  validateSignature: publicProcedure
    .input(z.object({
      payload: z.string(),
      signature: z.string(),
      secret: z.string(),
    }))
    .mutation(({ input }) => {
      return { valid: validateWebhookSignature(input.payload, input.signature, input.secret) };
    }),

  /** Log raw webhook payload */
  logRaw: publicProcedure
    .input(z.object({
      source: z.string().default("waba"),
      payload: z.string(),
      signature: z.string().optional(),
      signatureValid: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDbSafe();
      const [r] = await db.insert(whatsappWebhookLog).values({
        source: input.source,
        payload: input.payload,
        signature: input.signature ?? null,
        signatureValid: input.signatureValid ?? null,
        processedAt: new Date(),
      });
      return { id: (r as any).insertId as number };
    }),

  /**
   * Main bot message handler — full state machine
   * Replaces the shallow handler in routers.ts
   */
  message: publicProcedure
    .input(z.object({
      phone: z.string(),
      message: z.string(),
      messageType: z.enum(["text", "image", "document", "audio", "button", "interactive"]).default("text"),
      imageUrl: z.string().optional(),
      documentUrl: z.string().optional(),
      externalMsgId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const session = await getWhatsappSession(input.phone);
      const flow = session?.currentFlow ?? "menu";
      const state: any = session?.flowState ? JSON.parse(session.flowState) : {};
      const userId = await resolveUserId(input.phone);

      // Log inbound message
      await logMessage({
        phone: input.phone,
        userId,
        direction: "inbound",
        messageType: input.messageType,
        body: input.message,
        mediaUrl: input.imageUrl ?? input.documentUrl,
        externalMsgId: input.externalMsgId,
        sessionId: session?.id,
        flow,
      });

      let response = "";
      let nextFlow = flow;
      let nextState: any = state;

      const msg = input.message.trim().toLowerCase();
      const isGreeting = msg === "hi" || msg === "hello" || msg === "menu" || msg === "start";

      // ── MENU ──────────────────────────────────────────────────────────────────
      if (isGreeting || flow === "menu") {
        const linkedUser = userId ? "✓ Account linked" : "⚠️ Account not linked";
        response = `Welcome to *24/7 Pharmacy* 💊\n${linkedUser}\n\nReply with:\n1️⃣ Search medicines\n2️⃣ My orders\n3️⃣ Upload prescription\n4️⃣ Reorder last order\n5️⃣ Refill reminders\n6️⃣ Talk to staff\n7️⃣ My cart`;
        nextFlow = "menu";
        nextState = {};

      // ── SEARCH ────────────────────────────────────────────────────────────────
      } else if (msg === "1" || flow === "search") {
        if (flow !== "search" || !state.searching) {
          response = "🔍 Type the medicine name to search:";
          nextFlow = "search";
          nextState = { searching: true };
        } else {
          // Real catalogue search
          const db = await getDb();
          if (db && input.message.trim().length >= 2) {
            // Find user's store
            let storeId = 1; // default
            if (userId) {
              const userRow = await db.select({ buildingId: users.buildingId })
                .from(users).where(eq(users.id, userId)).limit(1);
              if (userRow[0]?.buildingId) {
                const bldg = await db.select({ primaryStoreId: buildings.primaryStoreId })
                  .from(buildings).where(eq(buildings.id, userRow[0].buildingId)).limit(1);
                if (bldg[0]?.primaryStoreId) storeId = bldg[0].primaryStoreId;
              }
            }
            const results = await getCatalog(storeId, input.message.trim(), undefined, 5);
            response = formatSearchResults(results);
            // Store results in state for add-to-cart
            nextState = { searchResults: results.map(r => ({ skuId: r.skuId, name: r.name, price: r.sellingPrice })), awaitingSelection: true };
            nextFlow = "search_results";
          } else {
            response = "Please type at least 2 characters to search.";
            nextFlow = "search";
            nextState = { searching: true };
          }
        }

      // ── SEARCH RESULTS — add to cart ──────────────────────────────────────────
      } else if (flow === "search_results") {
        const idx = parseInt(input.message.trim()) - 1;
        const results: any[] = state.searchResults ?? [];
        if (!isNaN(idx) && idx >= 0 && idx < results.length) {
          const item = results[idx];
          // Add to WhatsApp cart
          const db = await getDb();
          if (db) {
            let cart = (await db.select().from(whatsappCarts)
              .where(and(eq(whatsappCarts.phone, input.phone), eq(whatsappCarts.status, "active")))
              .limit(1))[0];
            if (!cart) {
              const [r] = await db.insert(whatsappCarts).values({
                phone: input.phone,
                userId: userId ?? null,
                status: "active",
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
              });
              cart = { id: (r as any).insertId } as any;
            }
            const sku = await db.select().from(storeSkus).where(eq(storeSkus.id, item.skuId)).limit(1);
            if (sku[0]) {
              await db.insert(whatsappCartLines).values({
                cartId: cart.id,
                productId: sku[0].productId,
                variantId: sku[0].variantId ?? null,
                storeSkuId: item.skuId,
                qty: 1,
                unitPrice: sku[0].sellingPrice ?? "0",
                lineTotal: sku[0].sellingPrice ?? "0",
                requiresPrescription: false,
              });
            }
          }
          response = `✓ *${item.name}* added to cart.\n\nReply *cart* to view cart, *1* to search more, or *hi* for menu.`;
          nextFlow = "menu";
          nextState = {};
        } else {
          response = "Invalid selection. Reply with a number from the list, or *hi* for menu.";
          nextFlow = "search_results";
        }

      // ── ORDER STATUS ──────────────────────────────────────────────────────────
      } else if (msg === "2" || flow === "status") {
        if (flow !== "status" || !state.awaitingOrderId) {
          if (userId) {
            // Show last 3 orders
            const userOrders = await getOrdersByUser(userId);
            if (userOrders.length) {
              const recent = userOrders.slice(0, 3).map(o =>
                `#${o.id} — ${o.status} — ₹${o.total}`
              ).join("\n");
              response = `*Your recent orders:*\n${recent}\n\nReply with Order ID for details, or *hi* for menu.`;
            } else {
              response = "No orders found.\n\nReply *hi* for main menu.";
            }
          } else {
            response = "Please enter your Order ID (e.g. *1234*):";
          }
          nextFlow = "status";
          nextState = { awaitingOrderId: true };
        } else {
          const orderId = parseInt(input.message.trim());
          if (!isNaN(orderId)) {
            const order = await getOrderById(orderId);
            if (order) {
              // Ownership check
              if (userId && order.userId !== userId) {
                response = "⚠️ You can only check your own orders.\n\nReply *hi* for main menu.";
              } else {
                response = formatOrderStatus(order);
              }
            } else {
              response = `Order #${orderId} not found.\n\nReply *hi* for main menu.`;
            }
          } else {
            response = "Invalid Order ID. Please enter a number.\n\nReply *hi* for main menu.";
          }
          nextFlow = "menu";
          nextState = {};
        }

      // ── RX UPLOAD ─────────────────────────────────────────────────────────────
      } else if (msg === "3" || flow === "rx_upload") {
        if (input.messageType === "image" && input.imageUrl) {
          const key = `whatsapp-rx/${input.phone}-${Date.now()}.jpg`;
          const rxId = await createWhatsappPrescription(input.phone, input.imageUrl, key);
          response = rxId
            ? `📋 Prescription received! (Ref: RX-${rxId})\nOur pharmacist will review it shortly.\n\nReply *hi* for main menu.`
            : "Prescription received. Our pharmacist will review it shortly.\n\nReply *hi* for main menu.";
            await writeAuditLog({
              actor: { id: userId ?? null, type: "whatsapp" },
              action: "whatsapp.rx.uploaded",
              entityType: "prescription",
              entityId: rxId ?? undefined,
              payload: JSON.stringify({ phone: input.phone }),
            });
          nextFlow = "menu";
          nextState = {};
        } else if (input.messageType === "document" && input.documentUrl) {
          // Supplier bill via WhatsApp — trigger OCR ingestion
          const db = await getDb();
          if (db) {
            const [r] = await db.insert(ingestionJobs).values({
              status: "pending",
              sourceType: "whatsapp",
              supplierHint: `WhatsApp upload from ${input.phone}`,
              rawFileUrl: input.documentUrl,
              rawFileKey: `whatsapp-bill/${input.phone}-${Date.now()}.pdf`,
            } as any);
            const jobId = (r as any).insertId as number;
            response = `📄 Supplier bill received! (Job #${jobId})\nOur team will process and import it.\n\nReply *hi* for main menu.`;
            await writeAuditLog({
              actor: { id: userId ?? null, type: "whatsapp" },
              action: "whatsapp.supplier_bill.uploaded",
              entityType: "ingestion_job",
              entityId: jobId,
              payload: JSON.stringify({ phone: input.phone }),
            });
          } else {
            response = "Document received. Our team will process it.\n\nReply *hi* for main menu.";
          }
          nextFlow = "menu";
          nextState = {};
        } else {
          response = "Please send your prescription as an *image* (photo), or a supplier bill as a *PDF document*.";
          nextFlow = "rx_upload";
          nextState = { awaitingImage: true };
        }

      // ── REORDER ───────────────────────────────────────────────────────────────
      } else if (msg === "4" || msg === "reorder" || flow === "reorder") {
        if (!userId) {
          response = "⚠️ Your phone is not linked to an account.\n\nPlease ask our staff to link your account, or log in via the 24/7 app.\n\nReply *hi* for main menu.";
          nextFlow = "menu";
          nextState = {};
        } else if (flow !== "reorder" || !state.awaitingConfirm) {
          const userOrders = await getOrdersByUser(userId);
          const lastOrder = userOrders[0];
          if (!lastOrder) {
            response = "No previous orders found.\n\nReply *hi* for main menu.";
            nextFlow = "menu";
            nextState = {};
          } else {
            const items = await getOrderItemsForReorder(lastOrder.id);
            const itemList = items.slice(0, 5).map(i =>
              `• ${(i as any).name ?? `Product #${i.productId}`} × ${i.quantity}`
            ).join("\n");
            response = `*Reorder from Order #${lastOrder.id}:*\n${itemList}\n\nTotal was: ₹${lastOrder.total}\n\nReply *yes* to reorder, or *hi* to cancel.`;
            nextFlow = "reorder";
            nextState = { awaitingConfirm: true, orderId: lastOrder.id };
          }
        } else if (state.awaitingConfirm && (msg === "yes" || msg === "y")) {
          // Rebuild cart from last order
          const items = await getOrderItemsForReorder(state.orderId);
          const db = await getDb();
          if (db && items.length) {
            // Clear existing active cart
            const existingCart = (await db.select().from(whatsappCarts)
              .where(and(eq(whatsappCarts.phone, input.phone), eq(whatsappCarts.status, "active")))
              .limit(1))[0];
            if (existingCart) {
              await db.delete(whatsappCartLines).where(eq(whatsappCartLines.cartId, existingCart.id));
              await db.update(whatsappCarts).set({ status: "abandoned" }).where(eq(whatsappCarts.id, existingCart.id));
            }
            // Create new cart
            const [r] = await db.insert(whatsappCarts).values({
              phone: input.phone,
              userId: userId ?? null,
              status: "active",
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            });
            const cartId = (r as any).insertId as number;
            for (const item of items) {
              if (item.storeSkuId) {
                const ia = item as any;
                // unitPrice/lineTotal may not be on getOrderItemsForReorder — fetch from orderItems
                const skuRow = await db.select({ sellingPrice: storeSkus.sellingPrice })
                  .from(storeSkus).where(eq(storeSkus.id, item.storeSkuId)).limit(1);
                const unitPrice = skuRow[0]?.sellingPrice ?? "0";
                const lineTotal = (parseFloat(unitPrice) * item.quantity).toFixed(2);
                await db.insert(whatsappCartLines).values({
                  cartId,
                  productId: item.productId,
                  variantId: ia.variantId ?? null,
                  storeSkuId: item.storeSkuId,
                  qty: item.quantity,
                  unitPrice,
                  lineTotal,
                  requiresPrescription: false,
                });
              }
            }
            response = `✓ Cart loaded with ${items.length} item(s) from Order #${state.orderId}.\n\nReply *cart* to review, or *confirm* to place order.`;
          } else {
            response = "Could not load items. Please try again.\n\nReply *hi* for main menu.";
          }
          nextFlow = "menu";
          nextState = {};
        } else {
          response = "Reorder cancelled.\n\nReply *hi* for main menu.";
          nextFlow = "menu";
          nextState = {};
        }

      // ── REFILL REMINDERS ──────────────────────────────────────────────────────
      } else if (msg === "5" || msg === "refill") {
        if (!userId) {
          response = "⚠️ Your phone is not linked to an account.\n\nPlease ask our staff to link your account.\n\nReply *hi* for main menu.";
        } else {
          const db = await getDb();
          if (db) {
            const plans = await db.select({
              id: refillPlans.id,
              productId: refillPlans.productId,
              nextDueDate: refillPlans.nextDueDate,
              status: refillPlans.status,
              productName: products.name,
            })
              .from(refillPlans)
              .leftJoin(products, eq(refillPlans.productId, products.id))
              .where(and(eq(refillPlans.userId, userId), eq(refillPlans.status, "active")))
              .orderBy(refillPlans.nextDueDate)
              .limit(5);
            if (plans.length) {
              const lines = plans.map(p => {
                const due = p.nextDueDate ? new Date(p.nextDueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—";
                return `💊 ${p.productName ?? `Product #${p.productId}`} — Due: ${due}`;
              });
              response = `*Your Refill Schedule:*\n\n${lines.join("\n")}\n\nReply *reorder* to reorder, or open the 24/7 app for full schedule.`;
            } else {
              response = "No active refill plans found.\n\nYour pharmacist will set up refill plans for your chronic medicines.\n\nReply *hi* for main menu.";
            }
          } else {
            response = "Your refill reminders are available in the 24/7 app under 'Refills'.\n\nReply *hi* for main menu.";
          }
        }
        nextFlow = "menu";
        nextState = {};

      // ── STAFF HANDOFF ─────────────────────────────────────────────────────────
      } else if (msg === "6" || msg === "help" || msg === "staff" || flow === "handoff") {
        const db = await getDb();
        if (db) {
          const [r] = await db.insert(staffHandoffs).values({
            phone: input.phone,
            userId: userId ?? null,
            sessionId: session?.id ?? null,
            reason: "customer_request",
            status: "open",
            priority: "normal",
          });
          const handoffId = (r as any).insertId as number;
          response = `👋 You're now in the staff queue.\nRef: #${handoffId}\n\nA team member will respond shortly. Please describe your query and we'll assist you.\n\nReply *hi* to return to bot menu.`;
          await writeAuditLog({
            actor: { id: userId ?? null, type: "whatsapp" },
            action: "whatsapp.handoff.created",
            entityType: "staff_handoff",
            entityId: handoffId,
            payload: JSON.stringify({ phone: input.phone }),
          });
        } else {
          response = "Please call us or visit the pharmacy for assistance.\n\nReply *hi* for main menu.";
        }
        nextFlow = "handoff";
        nextState = {};

      // ── CART VIEW ─────────────────────────────────────────────────────────────
      } else if (msg === "7" || msg === "cart") {
        const db = await getDb();
        if (db) {
          const cart = (await db.select().from(whatsappCarts)
            .where(and(eq(whatsappCarts.phone, input.phone), eq(whatsappCarts.status, "active")))
            .limit(1))[0];
          if (cart) {
            const lines = await db.select({
              productId: whatsappCartLines.productId,
              qty: whatsappCartLines.qty,
              lineTotal: whatsappCartLines.lineTotal,
              productName: products.name,
            })
              .from(whatsappCartLines)
              .leftJoin(products, eq(whatsappCartLines.productId, products.id))
              .where(eq(whatsappCartLines.cartId, cart.id));
            response = formatCart(lines);
          } else {
            response = "Your cart is empty.\n\nReply *1* to search medicines, or *hi* for main menu.";
          }
        } else {
          response = "Could not load cart. Please try again.\n\nReply *hi* for main menu.";
        }
        nextFlow = "menu";
        nextState = {};

      // ── CONFIRM ORDER ─────────────────────────────────────────────────────────
      } else if (msg === "confirm") {
        if (!userId) {
          response = "⚠️ Your phone is not linked to an account. Please ask our staff to link your account.\n\nReply *hi* for main menu.";
          nextFlow = "menu";
          nextState = {};
        } else {
          const db = await getDb();
          if (db) {
            const cart = (await db.select().from(whatsappCarts)
              .where(and(eq(whatsappCarts.phone, input.phone), eq(whatsappCarts.status, "active")))
              .limit(1))[0];
            if (!cart || !cart.storeId) {
              response = "Cart is empty or store not set. Reply *1* to search medicines first.";
            } else {
              const lines = await db.select().from(whatsappCartLines).where(eq(whatsappCartLines.cartId, cart.id));
              if (!lines.length) {
                response = "Cart is empty. Reply *1* to search medicines.";
              } else {
                const subtotal = lines.reduce((s, l) => s + parseFloat(l.lineTotal), 0).toFixed(2);
                const orderId = await createOrder({
                  userId,
                  storeId: cart.storeId,
                  prescriptionId: cart.prescriptionId ?? undefined,
                  subtotal,
                  total: subtotal,
                  promisedSlaMins: 45,
                  deliveryAddress: cart.deliveryAddress ?? undefined,
                  flatNumber: cart.flatNumber ?? undefined,
                  buildingId: cart.buildingId ?? undefined,
                  source: "whatsapp",
                  items: lines.map(l => ({
                    productId: l.productId,
                    variantId: l.variantId ?? undefined,
                    storeSkuId: l.storeSkuId,
                    quantity: l.qty,
                    unitPrice: l.unitPrice,
                    lineTotal: l.lineTotal,
                  })),
                });
                await db.update(whatsappCarts)
                  .set({ status: "confirmed", convertedOrderId: orderId })
                  .where(eq(whatsappCarts.id, cart.id));
                response = `✓ *Order #${orderId} placed!*\nTotal: ₹${subtotal}\nEstimated delivery: ~45 mins\n\nReply *status ${orderId}* to track, or *hi* for main menu.`;
                await writeAuditLog({
                  actor: { id: userId, type: "whatsapp" },
                  action: "whatsapp.order.created",
                  entityType: "order",
                  entityId: orderId,
                  payload: JSON.stringify({ phone: input.phone, cartId: cart.id }),
                });
              }
            }
          } else {
            response = "Could not place order. Please try again.\n\nReply *hi* for main menu.";
          }
          nextFlow = "menu";
          nextState = {};
        }

      // ── CLEAR CART ────────────────────────────────────────────────────────────
      } else if (msg === "clear") {
        const db = await getDb();
        if (db) {
          const cart = (await db.select().from(whatsappCarts)
            .where(and(eq(whatsappCarts.phone, input.phone), eq(whatsappCarts.status, "active")))
            .limit(1))[0];
          if (cart) {
            await db.delete(whatsappCartLines).where(eq(whatsappCartLines.cartId, cart.id));
            await db.update(whatsappCarts).set({ status: "abandoned" }).where(eq(whatsappCarts.id, cart.id));
          }
        }
        response = "Cart cleared.\n\nReply *hi* for main menu.";
        nextFlow = "menu";
        nextState = {};

      // ── STATUS SHORTCUT ───────────────────────────────────────────────────────
      } else if (msg.startsWith("status ")) {
        const orderId = parseInt(msg.replace("status ", "").trim());
        if (!isNaN(orderId)) {
          const order = await getOrderById(orderId);
          if (order) {
            if (userId && order.userId !== userId) {
              response = "⚠️ You can only check your own orders.\n\nReply *hi* for main menu.";
            } else {
              response = formatOrderStatus(order);
            }
          } else {
            response = `Order #${orderId} not found.\n\nReply *hi* for main menu.`;
          }
        } else {
          response = "Invalid order ID.\n\nReply *hi* for main menu.";
        }
        nextFlow = "menu";
        nextState = {};

      // ── DELIVERY EXCEPTION ────────────────────────────────────────────────────
      } else if (msg === "delivery issue" || msg === "not delivered" || msg === "wrong order") {
        const db = await getDb();
        if (db) {
          const [r] = await db.insert(staffHandoffs).values({
            phone: input.phone,
            userId: userId ?? null,
            sessionId: session?.id ?? null,
            reason: "delivery_exception",
            reasonNote: `Customer reported: "${input.message}"`,
            status: "open",
            priority: "high",
          });
          const handoffId = (r as any).insertId as number;
          response = `⚠️ Delivery issue reported. Ref: #${handoffId}\n\nOur team will contact you within 15 minutes.\n\nReply *hi* for main menu.`;
        } else {
          response = "Please call us directly for delivery issues.\n\nReply *hi* for main menu.";
        }
        nextFlow = "menu";
        nextState = {};

      // ── FALLBACK ──────────────────────────────────────────────────────────────
      } else {
        response = "I didn't understand that. Reply *hi* to see the main menu.";
        nextFlow = "menu";
        nextState = {};
      }

      // Save session
      await upsertWhatsappSession(input.phone, {
        userId: userId ?? undefined,
        currentFlow: nextFlow,
        flowState: JSON.stringify(nextState),
      });

      // Log outbound response
      await logMessage({
        phone: input.phone,
        userId,
        direction: "outbound",
        messageType: "text",
        body: response,
        sessionId: session?.id,
        flow: nextFlow,
        status: "sent",
      });

      return { response };
    }),
});

// ─── Admin procedures ─────────────────────────────────────────────────────────

const adminRouter = router({
  /** Recent WhatsApp-sourced orders */
  recentOrders: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ input }) => {
      const db = await getDbSafe();
      return db.select({
        id: orders.id,
        userId: orders.userId,
        status: orders.status,
        total: orders.total,
        source: orders.source,
        createdAt: orders.createdAt,
        customerName: users.name,
        customerPhone: users.phone,
      })
        .from(orders)
        .leftJoin(users, eq(orders.userId, users.id))
        .where(eq(orders.source, "whatsapp"))
        .orderBy(desc(orders.createdAt))
        .limit(input.limit);
    }),

  /** Stats summary */
  stats: protectedProcedure.query(async () => {
    const db = await getDbSafe();
    const [linkedCount] = await db.select({ count: sql<number>`count(*)` })
      .from(whatsappLinks).where(eq(whatsappLinks.isActive, true));
    const [openHandoffs] = await db.select({ count: sql<number>`count(*)` })
      .from(staffHandoffs).where(eq(staffHandoffs.status, "open"));
    const [waOrders] = await db.select({ count: sql<number>`count(*)` })
      .from(orders).where(eq(orders.source, "whatsapp"));
    const [msgCount] = await db.select({ count: sql<number>`count(*)` })
      .from(whatsappMessages);
    return {
      linkedCustomers: linkedCount.count,
      openHandoffs: openHandoffs.count,
      totalWaOrders: waOrders.count,
      totalMessages: msgCount.count,
    };
  }),

  /** Active sessions */
  sessions: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ input }) => {
      const db = await getDbSafe();
      return db.select({
        id: whatsappSessions.id,
        phone: whatsappSessions.phone,
        userId: whatsappSessions.userId,
        currentFlow: whatsappSessions.currentFlow,
        lastMessageAt: whatsappSessions.lastMessageAt,
        customerName: users.name,
      })
        .from(whatsappSessions)
        .leftJoin(users, eq(whatsappSessions.userId, users.id))
        .orderBy(desc(whatsappSessions.lastMessageAt))
        .limit(input.limit);
    }),
});

// ─── Export ───────────────────────────────────────────────────────────────────

export const whatsappFullRouter = router({
  webhook: webhookRouter,
  link: linkRouter,
  template: templateRouter,
  handoff: handoffRouter,
  message: messageRouter,
  cart: cartRouter,
  admin: adminRouter,
});
