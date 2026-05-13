/**
 * whatsappRouterExtension.ts — Extension for whatsappRouter.ts
 *
 * Contains: handoffRouter, messageRouter, cartRouter, adminRouter
 * These are spread into whatsappFullRouter in whatsappRouter.ts.
 */
import type { ResultSetHeader } from "mysql2";
import crypto from "node:crypto";
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, like, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  whatsappLinks,
  whatsappMessages,
  whatsappCarts,
  whatsappCartLines,
  staffHandoffs,
  whatsappSessions,
  orders,
  products,
  storeSkus,
  users,
} from "../../drizzle/schema";
import {
  getWhatsappSession,
  upsertWhatsappSession,
  getOrdersByUser as _getOrdersByUser,
  getOrderItemsForReorder as _getOrderItemsForReorder,
  createOrder,
  writeAuditLog,
} from "../db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getDbSafe() {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "DB unavailable",
    });
  return db;
}

async function resolveUserId(phone: string): Promise<number | null> {
  const { normalizeWhatsAppPhone } = await import("./whatsappRouter");
  phone = normalizeWhatsAppPhone(phone);
  const db = await getDb();
  if (!db) return null;
  const { whatsappLinks: links } = await import("../../drizzle/schema");
  const link = await db
    .select()
    .from(links)
    .where(and(eq(links.phone, phone), eq(links.isActive, true)))
    .limit(1);
  if (link[0]?.userId) return link[0].userId;
  const session = await getWhatsappSession(phone);
  if (session?.userId) return session.userId;
  const { getUserByPhone } = await import("../db");
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

function assertWhatsappWebhookGuard(
  ctx: { req?: { header?: (name: string) => string | undefined } },
  payload?: string
) {
  if (process.env.NODE_ENV !== "production") return;
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
  const validateSig = (p: string, sig: string, sec: string) => {
    const exp = crypto.createHmac("sha256", sec).update(p).digest("hex");
    const s = sig.replace(/^sha256=/, "");
    try {
      return crypto.timingSafeEqual(
        Buffer.from(exp, "hex"),
        Buffer.from(s, "hex")
      );
    } catch {
      return false;
    }
  };
  const sigOk = Boolean(
    secret &&
      incomingSig &&
      rawPayload &&
      validateSig(rawPayload, incomingSig, secret)
  );
  if (!tokenOk && !sigOk)
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Webhook verification required",
    });
}

async function _createRegulatedIntentHandoff(input: {
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

function _formatCart(
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

// ─── Staff handoff management ─────────────────────────────────────────────────

const handoffRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        status: z
          .enum(["open", "assigned", "resolved", "closed", "all"])
          .default("open"),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(50),
      })
    )
    .query(async ({ input }) => {
      const db = await getDbSafe();
      const offset = (input.page - 1) * input.limit;
      const conditions: ReturnType<typeof eq>[] = [];
      if (input.status !== "all")
        conditions.push(eq(staffHandoffs.status, input.status));
      const rows = await db
        .select({
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
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(staffHandoffs)
        .where(conditions.length ? and(...conditions) : undefined);
      return { rows, total: count };
    }),

  assign: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        staffId: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDbSafe();
      await db
        .update(staffHandoffs)
        .set({
          status: "assigned",
          assignedTo: input.staffId,
          assignedAt: new Date(),
        })
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
    .input(
      z.object({
        id: z.number().int().positive(),
        resolutionNote: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDbSafe();
      await db
        .update(staffHandoffs)
        .set({
          status: "resolved",
          resolvedAt: new Date(),
          resolutionNote: input.resolutionNote ?? null,
        })
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

// ─── Message audit log ────────────────────────────────────────────────────────

const messageRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        phone: z.string().optional(),
        direction: z.enum(["inbound", "outbound", "all"]).default("all"),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(200).default(50),
      })
    )
    .query(async ({ input }) => {
      const db = await getDbSafe();
      const offset = (input.page - 1) * input.limit;
      const conditions: ReturnType<typeof eq>[] = [];
      if (input.phone)
        conditions.push(like(whatsappMessages.phone, `%${input.phone}%`));
      if (input.direction !== "all")
        conditions.push(eq(whatsappMessages.direction, input.direction));
      const rows = await db
        .select()
        .from(whatsappMessages)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(whatsappMessages.createdAt))
        .limit(input.limit)
        .offset(offset);
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(whatsappMessages)
        .where(conditions.length ? and(...conditions) : undefined);
      return { rows, total: count };
    }),
});

// ─── Cart management ──────────────────────────────────────────────────────────

const cartRouter = router({
  get: publicProcedure
    .input(z.object({ phone: z.string() }))
    .query(async ({ input }) => {
      const db = await getDbSafe();
      const cart = await db
        .select()
        .from(whatsappCarts)
        .where(
          and(
            eq(whatsappCarts.phone, input.phone),
            eq(whatsappCarts.status, "active")
          )
        )
        .orderBy(desc(whatsappCarts.createdAt))
        .limit(1);
      if (!cart[0]) return { cart: null, lines: [] };
      const lines = await db
        .select({
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
    .input(
      z.object({
        phone: z.string(),
        storeSkuId: z.number().int().positive(),
        qty: z.number().int().min(1).default(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      assertWhatsappWebhookGuard(ctx);
      const db = await getDbSafe();
      let cart = (
        await db
          .select()
          .from(whatsappCarts)
          .where(
            and(
              eq(whatsappCarts.phone, input.phone),
              eq(whatsappCarts.status, "active")
            )
          )
          .limit(1)
      )[0];

      const userId = await resolveUserId(input.phone);
      if (!cart) {
        const cartInsert = await db.insert(whatsappCarts).values({
          phone: input.phone,
          userId: userId ?? null,
          storeId: null,
          status: "active",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });
        const [cartHeader] = cartInsert as unknown as [ResultSetHeader];
        const cartId = cartHeader.insertId;
        cart = { id: cartId } as typeof cart;
      }

      const sku = await db
        .select({
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
      if (!sku[0])
        throw new TRPCError({ code: "NOT_FOUND", message: "SKU not found" });

      const unitPrice = sku[0].sellingPrice ?? "0";
      const lineTotal = (parseFloat(unitPrice) * input.qty).toFixed(2);

      const existing = await db
        .select()
        .from(whatsappCartLines)
        .where(
          and(
            eq(whatsappCartLines.cartId, cart.id),
            eq(whatsappCartLines.storeSkuId, input.storeSkuId)
          )
        )
        .limit(1);
      if (existing[0]) {
        const newQty = existing[0].qty + input.qty;
        await db
          .update(whatsappCartLines)
          .set({
            qty: newQty,
            lineTotal: (parseFloat(unitPrice) * newQty).toFixed(2),
          })
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

      if (sku[0].storeId) {
        await db
          .update(whatsappCarts)
          .set({ storeId: sku[0].storeId })
          .where(eq(whatsappCarts.id, cart.id));
      }

      return { ok: true, productName: sku[0].productName };
    }),

  clear: publicProcedure
    .input(z.object({ phone: z.string() }))
    .mutation(async ({ input, ctx }) => {
      assertWhatsappWebhookGuard(ctx);
      const db = await getDbSafe();
      const cart = (
        await db
          .select()
          .from(whatsappCarts)
          .where(
            and(
              eq(whatsappCarts.phone, input.phone),
              eq(whatsappCarts.status, "active")
            )
          )
          .limit(1)
      )[0];
      if (cart) {
        await db
          .delete(whatsappCartLines)
          .where(eq(whatsappCartLines.cartId, cart.id));
        await db
          .update(whatsappCarts)
          .set({ status: "abandoned" })
          .where(eq(whatsappCarts.id, cart.id));
      }
      return { ok: true };
    }),

  confirm: publicProcedure
    .input(
      z.object({
        phone: z.string(),
        deliveryAddress: z.string().optional(),
        flatNumber: z.string().optional(),
        buildingId: z.number().int().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      assertWhatsappWebhookGuard(ctx);
      const db = await getDbSafe();
      const cart = (
        await db
          .select()
          .from(whatsappCarts)
          .where(
            and(
              eq(whatsappCarts.phone, input.phone),
              eq(whatsappCarts.status, "active")
            )
          )
          .limit(1)
      )[0];
      if (!cart)
        throw new TRPCError({ code: "NOT_FOUND", message: "No active cart" });

      const lines = await db
        .select({
          productId: whatsappCartLines.productId,
          variantId: whatsappCartLines.variantId,
          storeSkuId: whatsappCartLines.storeSkuId,
          qty: whatsappCartLines.qty,
          unitPrice: whatsappCartLines.unitPrice,
          lineTotal: whatsappCartLines.lineTotal,
        })
        .from(whatsappCartLines)
        .where(eq(whatsappCartLines.cartId, cart.id));

      if (!lines.length)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cart is empty" });

      const userId = await resolveUserId(input.phone);
      if (!userId)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message:
            "Phone not linked to a customer account. Please link your account first.",
        });

      const storeId = cart.storeId;
      if (!storeId)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No store assigned to cart",
        });

      const subtotal = lines
        .reduce((s, l) => s + parseFloat(l.lineTotal), 0)
        .toFixed(2);
      const total = subtotal;

      const orderId = await createOrder({
        userId,
        storeId,
        prescriptionId: cart.prescriptionId ?? undefined,
        subtotal,
        total,
        promisedSlaMins: 45,
        deliveryAddress:
          input.deliveryAddress ?? cart.deliveryAddress ?? undefined,
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

      await db
        .update(whatsappCarts)
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

// ─── Admin procedures ─────────────────────────────────────────────────────────

const adminRouter = router({
  recentOrders: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ input }) => {
      const db = await getDbSafe();
      return db
        .select({
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

  stats: protectedProcedure.query(async () => {
    const db = await getDbSafe();
    const [linkedCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(whatsappLinks)
      .where(eq(whatsappLinks.isActive, true));
    const [openHandoffs] = await db
      .select({ count: sql<number>`count(*)` })
      .from(staffHandoffs)
      .where(eq(staffHandoffs.status, "open"));
    const [waOrders] = await db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(eq(orders.source, "whatsapp"));
    const [msgCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(whatsappMessages);
    return {
      linkedCustomers: linkedCount.count,
      openHandoffs: openHandoffs.count,
      totalWaOrders: waOrders.count,
      totalMessages: msgCount.count,
    };
  }),

  sessions: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(50),
      })
    )
    .query(async ({ input }) => {
      const db = await getDbSafe();
      return db
        .select({
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

// ─── Extension export ─────────────────────────────────────────────────────────

export const whatsappRouterExtension = {
  handoff: handoffRouter,
  message: messageRouter,
  cart: cartRouter,
  admin: adminRouter,
};
