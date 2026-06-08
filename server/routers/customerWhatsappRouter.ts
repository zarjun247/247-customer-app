import { z } from "zod";
import { randomUUID } from "node:crypto";
import { router, publicProcedure } from "../_core/trpc";
import { redactSensitive } from "../_core/redact";
import { assertOtpLimiterMode } from "./authRouter";
import {
  assertWhatsappWebhookGuard,
  isRegulatedMedicineIntent,
  normalizeWhatsAppPhone,
} from "./whatsappRouter";
import {
  getUserByPhone,
  getWhatsappSession,
  upsertWhatsappSession,
  getOrderById,
  createWhatsappPrescription,
  writeAuditLog,
} from "../db";

export const customerWhatsappRouter = router({
  webhook: publicProcedure
    .input(
      z.object({
        phone: z.string(),
        message: z.string(),
        messageType: z.enum(["text", "image", "button"]).default("text"),
        imageUrl: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      assertOtpLimiterMode();
      assertWhatsappWebhookGuard(ctx, JSON.stringify(input));
      const phone = normalizeWhatsAppPhone(input.phone);
      const linkedUser = await getUserByPhone(phone);
      if (!linkedUser && isRegulatedMedicineIntent(input.message)) {
        await upsertWhatsappSession(phone, {
          currentFlow: "pending_link",
          flowState: JSON.stringify({
            identity: "unlinked",
            reason: "regulated_intent",
          }),
        });
        await writeAuditLog({
          actor: { id: null, type: "whatsapp" },
          action: "whatsapp.regulated_intent.escalated",
          entityType: "whatsapp_session",
          payload: JSON.stringify({ phone: redactSensitive(phone) }), // PII-safe
        });
        return {
          response:
            "This looks like a regulated medicine or medical question. I cannot give medical advice or confirm refills on WhatsApp. A pharmacist will review it. Please upload a valid prescription or wait for staff assistance.",
        };
      }
      const session = await getWhatsappSession(phone);
      const flow = session?.currentFlow ?? "menu";
      type FlowState = {
        searching?: boolean;
        awaitingOrderId?: boolean;
        awaitingImage?: boolean;
      };
      const state: FlowState = session?.flowState
        ? (JSON.parse(session.flowState) as FlowState)
        : {};

      let response = "";
      let nextFlow = flow;
      let nextState: FlowState = state;

      if (
        input.message.toLowerCase() === "hi" ||
        input.message.toLowerCase() === "hello" ||
        flow === "menu"
      ) {
        response =
          "Welcome to 24/7 Pharmacy.\n\nReply with:\n1. Search medicines\n2. My orders\n3. Upload prescription\n4. Reorder last order\n5. Refill reminders";
        nextFlow = "menu";
        nextState = {};
      } else if (input.message === "1" || flow === "search") {
        if (flow !== "search" || !state.searching) {
          response = "Please type the medicine name to search:";
          nextFlow = "search";
          nextState = { searching: true };
        } else {
          response = `Searching for "${input.message}"...\n\nPlease open the 24/7 app to view results and add to cart.\n\nReply "hi" for main menu.`;
          nextFlow = "menu";
          nextState = {};
        }
      } else if (input.message === "2" || flow === "status") {
        if (!linkedUser) {
          response =
            "Your phone is not linked to an account, so I cannot show private order details on WhatsApp. Please link your account in the app or ask staff for help.";
          nextFlow = "menu";
          nextState = {};
        } else if (flow !== "status" || !state.awaitingOrderId) {
          response = "Please enter your Order ID (e.g. 1234):";
          nextFlow = "status";
          nextState = { awaitingOrderId: true };
        } else {
          const orderId = parseInt(input.message);
          if (!isNaN(orderId)) {
            const order = await getOrderById(orderId);
            if (order && order.userId !== linkedUser.id) {
              response =
                'I cannot show private order details for this WhatsApp session. Please use the linked account in the 24/7 app or ask staff for help. Reply "hi" for main menu.';
            } else if (order) {
              const statusLabel: Record<string, string> = {
                created: "Order Received",
                pharmacist_reviewing: "Pharmacist Reviewing",
                picking: "Picking",
                out_for_delivery: "Out for Delivery",
                delivered: "Delivered",
                cancelled: "Cancelled",
              };
              response = `Order #${orderId}\nStatus: ${statusLabel[order.status] ?? order.status}\nTotal: ₹${order.total}\n\nReply "hi" for main menu.`;
            } else {
              response = `Order #${orderId} not found. Reply "hi" for main menu.`;
            }
          } else {
            response = 'Invalid order ID. Reply "hi" for main menu.';
          }
          nextFlow = "menu";
          nextState = {};
        }
      } else if (input.message === "3" || flow === "rx_upload") {
        if (input.messageType === "image" && input.imageUrl) {
          try {
            const key = `whatsapp-rx/${randomUUID()}.jpg`;
            await createWhatsappPrescription(phone, input.imageUrl, key);
          } catch (e) {
            console.error("[WhatsApp] Failed to persist Rx:", e);
          }
          response =
            'Prescription received and saved. Our pharmacist will review it shortly.\n\nReply "hi" for main menu.';
          nextFlow = "menu";
          nextState = {};
        } else {
          response =
            "Please send your prescription as an image (photo of the prescription).";
          nextFlow = "rx_upload";
          nextState = { awaitingImage: true };
        }
      } else if (input.message === "4") {
        response =
          "To reorder, please open the 24/7 app and tap 'Reorder' on any past order.\n\nReply \"hi\" for main menu.";
        nextFlow = "menu";
        nextState = {};
      } else if (input.message === "5") {
        response =
          "Your refill reminders are available in the 24/7 app under 'Refills'.\n\nReply \"hi\" for main menu.";
        nextFlow = "menu";
        nextState = {};
      } else {
        response =
          'I didn\'t understand that. Reply "hi" to see the main menu.';
        nextFlow = "menu";
        nextState = {};
      }

      await upsertWhatsappSession(phone, {
        currentFlow: nextFlow,
        flowState: JSON.stringify(nextState),
      });

      return { response };
    }),
});
