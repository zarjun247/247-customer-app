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

import type { ResultSetHeader } from "mysql2";
import { z } from "zod";
import { redactSensitive } from "../_core/redact";
import { router, publicProcedure } from "../_core/trpc";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  whatsappCarts,
  whatsappCartLines,
  products,
  staffHandoffs,
  whatsappWebhookLog,
} from "../../drizzle/schema";
import { writeAuditLog } from "../db";
import { whatsappRouterExtension } from "./whatsappMessagingRouter";
import { linkRouter } from "./whatsappLinkRouter";
import { templateRouter } from "./whatsappTemplateRouter";
import {
  getDbSafe,
  resolveUserId,
  logMessage,
  formatCart,
  formatOrderStatus,
  isRegulatedMedicineIntent,
  assertWhatsappWebhookGuard,
  createRegulatedIntentHandoff,
  normalizeWhatsAppPhone,
  validateWebhookSignature,
  isTruthyEnv,
} from "./whatsappHelpers";
import {
  handleSearchFlow,
  handleSearchResultsFlow,
  handleOrderStatusFlow,
  handleRxUploadFlow,
  handleReorderFlow,
  handleConfirmOrderFlow,
  handleRefillFlow,
} from "./whatsappFlowHandlers";
import { getWhatsappSession, upsertWhatsappSession, getOrderById } from "../db";

// Re-export public helpers consumed by other routers
export {
  validateWebhookSignature,
  isTruthyEnv,
  normalizeWhatsAppPhone,
  isRegulatedMedicineIntent,
  assertWhatsappWebhookGuard,
};

const webhookRouter = router({
  validateSignature: publicProcedure
    .input(
      z.object({
        payload: z.string(),
        signature: z.string(),
        secret: z.string(),
      })
    )
    .mutation(({ input }) => {
      return {
        valid: validateWebhookSignature(
          input.payload,
          input.signature,
          input.secret
        ),
      };
    }),

  logRaw: publicProcedure
    .input(
      z.object({
        source: z.string().default("waba"),
        payload: z.string(),
        signature: z.string().optional(),
        signatureValid: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      assertWhatsappWebhookGuard(ctx);
      const db = await getDbSafe();
      const webhookInsert = await db.insert(whatsappWebhookLog).values({
        source: input.source,
        payload: input.payload,
        signature: input.signature ?? null,
        signatureValid: input.signatureValid ?? null,
        processedAt: new Date(),
      });
      const [webhookHeader] = webhookInsert as unknown as [ResultSetHeader];
      return { id: webhookHeader.insertId };
    }),

  message: publicProcedure
    .input(
      z.object({
        phone: z.string(),
        message: z.string(),
        messageType: z
          .enum(["text", "image", "document", "audio", "button", "interactive"])
          .default("text"),
        imageUrl: z.string().optional(),
        documentUrl: z.string().optional(),
        externalMsgId: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      assertWhatsappWebhookGuard(ctx, JSON.stringify(input));
      const phone = normalizeWhatsAppPhone(input.phone);
      const session = await getWhatsappSession(phone);
      const flow = session?.currentFlow ?? "menu";
      const state: Record<string, unknown> = session?.flowState
        ? (JSON.parse(session.flowState) as Record<string, unknown>)
        : {};
      const userId = await resolveUserId(phone);

      await logMessage({
        phone,
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
      let nextState: Record<string, unknown> = state;

      const msg = input.message.trim().toLowerCase();
      const isGreeting =
        msg === "hi" || msg === "hello" || msg === "menu" || msg === "start";

      if (!isGreeting && isRegulatedMedicineIntent(input.message)) {
        const handoffId = await createRegulatedIntentHandoff({
          phone,
          userId,
          sessionId: session?.id,
          message: input.message,
        });
        response = `This looks like a regulated medicine or medical question. I cannot give medical advice or confirm refills on WhatsApp. A pharmacist will review it${handoffId ? ` (Ref: #${handoffId})` : ""}. Please upload a valid prescription or wait for staff assistance.`;
        nextFlow = "staff_handoff";
        nextState = { reason: "regulated_intent", handoffId };
      } else if (isGreeting || flow === "menu") {
        const linkedUser = userId
          ? "✓ Account linked"
          : "⚠️ Account not linked";
        response = `Welcome to *24/7 Pharmacy* 💊\n${linkedUser}\n\nReply with:\n1️⃣ Search medicines\n2️⃣ My orders\n3️⃣ Upload prescription\n4️⃣ Reorder last order\n5️⃣ Refill reminders\n6️⃣ Talk to staff\n7️⃣ My cart`;
        nextFlow = "menu";
        nextState = {};
      } else if (msg === "1" || flow === "search") {
        ({ response, nextFlow, nextState } = await handleSearchFlow({
          flow,
          state,
          userId,
          message: input.message,
        }));
      } else if (flow === "search_results") {
        ({ response, nextFlow, nextState } = await handleSearchResultsFlow({
          phone,
          userId,
          state,
          message: input.message,
        }));
      } else if (msg === "2" || flow === "status") {
        ({ response, nextFlow, nextState } = await handleOrderStatusFlow({
          userId,
          flow,
          state,
          msg,
          message: input.message,
        }));
      } else if (msg === "3" || flow === "rx_upload") {
        ({ response, nextFlow, nextState } = await handleRxUploadFlow({
          phone,
          userId,
          messageType: input.messageType,
          imageUrl: input.imageUrl,
          documentUrl: input.documentUrl,
        }));
      } else if (msg === "4" || msg === "reorder" || flow === "reorder") {
        ({ response, nextFlow, nextState } = await handleReorderFlow({
          phone,
          userId,
          flow,
          state,
          msg,
        }));
      } else if (msg === "5" || msg === "refill") {
        ({ response, nextFlow, nextState } = await handleRefillFlow({
          userId,
        }));
      } else if (
        msg === "6" ||
        msg === "help" ||
        msg === "staff" ||
        flow === "handoff"
      ) {
        const db = await getDb();
        if (db) {
          const staffHandoffInsert = await db.insert(staffHandoffs).values({
            phone: input.phone,
            userId: userId ?? null,
            sessionId: session?.id ?? null,
            reason: "customer_request",
            status: "open",
            priority: "normal",
          });
          const [staffHandoffHeader] = staffHandoffInsert as unknown as [
            ResultSetHeader,
          ];
          const handoffId = staffHandoffHeader.insertId;
          response = `👋 You're now in the staff queue.\nRef: #${handoffId}\n\nA team member will respond shortly. Please describe your query and we'll assist you.\n\nReply *hi* to return to bot menu.`;
          await writeAuditLog({
            actor: { id: userId ?? null, type: "whatsapp" },
            action: "whatsapp.handoff.created",
            entityType: "staff_handoff",
            entityId: handoffId,
            payload: JSON.stringify({ phone: redactSensitive(input.phone) }), // PII-safe
          });
        } else {
          response =
            "Please call us or visit the pharmacy for assistance.\n\nReply *hi* for main menu.";
        }
        nextFlow = "handoff";
        nextState = {};
      } else if (msg === "7" || msg === "cart") {
        const db = await getDb();
        if (db) {
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
            const lines = await db
              .select({
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
            response =
              "Your cart is empty.\n\nReply *1* to search medicines, or *hi* for main menu.";
          }
        } else {
          response =
            "Could not load cart. Please try again.\n\nReply *hi* for main menu.";
        }
        nextFlow = "menu";
        nextState = {};
      } else if (msg === "confirm") {
        if (!userId) {
          response =
            "⚠️ Your phone is not linked to an account. Please ask our staff to link your account.\n\nReply *hi* for main menu.";
          nextFlow = "menu";
          nextState = {};
        } else {
          ({ response, nextFlow, nextState } = await handleConfirmOrderFlow({
            phone,
            userId,
            sessionId: session?.id,
          }));
        }
      } else if (msg === "clear") {
        const db = await getDb();
        if (db) {
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
        }
        response = "Cart cleared.\n\nReply *hi* for main menu.";
        nextFlow = "menu";
        nextState = {};
      } else if (msg.startsWith("status ")) {
        const orderId = parseInt(msg.replace("status ", "").trim());
        if (!isNaN(orderId)) {
          const order = await getOrderById(orderId);
          if (order) {
            if (!userId || order.userId !== userId) {
              response =
                "⚠️ I cannot show private order details for this WhatsApp session. Please use the linked account in the 24/7 app or ask staff for help.\n\nReply *hi* for main menu.";
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
      } else if (
        msg === "delivery issue" ||
        msg === "not delivered" ||
        msg === "wrong order"
      ) {
        const db = await getDb();
        if (db) {
          const deliveryExInsert = await db.insert(staffHandoffs).values({
            phone: input.phone,
            userId: userId ?? null,
            sessionId: session?.id ?? null,
            reason: "delivery_exception",
            reasonNote: `Customer reported: "${input.message}"`,
            status: "open",
            priority: "high",
          });
          const [deliveryExHeader] = deliveryExInsert as unknown as [
            ResultSetHeader,
          ];
          const handoffId = deliveryExHeader.insertId;
          response = `⚠️ Delivery issue reported. Ref: #${handoffId}\n\nOur team will contact you within 15 minutes.\n\nReply *hi* for main menu.`;
        } else {
          response =
            "Please call us directly for delivery issues.\n\nReply *hi* for main menu.";
        }
        nextFlow = "menu";
        nextState = {};
      } else {
        response = "I didn't understand that. Reply *hi* to see the main menu.";
        nextFlow = "menu";
        nextState = {};
      }

      await upsertWhatsappSession(phone, {
        userId: userId ?? undefined,
        currentFlow: nextFlow,
        flowState: JSON.stringify(nextState),
      });

      await logMessage({
        phone,
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

export const whatsappFullRouter = router({
  webhook: webhookRouter,
  link: linkRouter,
  template: templateRouter,
  ...whatsappRouterExtension,
});
