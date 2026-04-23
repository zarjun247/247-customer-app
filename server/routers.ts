import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  getBuildings, getStoreById, getCatalog, getSkuById,
  getCart, upsertCartItem, clearCart, softLockCart, applySoftLockToSkus, releaseSoftLock,
  createOrder, getOrdersByUser, getOrderById, getOrderItems, updateOrderStatus, updateOrderInvoice,
  createPrescription, getPrescriptionsByUser, getPrescriptionById,
  getRefillReminders, dismissRefillReminder, upsertRefillReminder,
  getUserById, updateUserProfile, writeAuditLog, createOtp, verifyOtp,
  getWhatsappSession, upsertWhatsappSession, getBuildingById,
  computeRefillIntervalFromHistory, getOrderItemsForReorder,
  createWhatsappPrescription, generateAndStoreInvoice,
} from "./db";
import { storagePut } from "./storage";
import { ENV } from "./_core/env";
import { resolveStore, formatRoutingAuditEntry } from "./routing";

// ─── Auth Router ──────────────────────────────────────────────────────────────
const authRouter = router({
  me: publicProcedure.query(opts => opts.ctx.user),
  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true } as const;
  }),
  // OTP-based phone login (simulated — in production integrate Twilio/Firebase)
  sendOtp: publicProcedure
    .input(z.object({ phone: z.string().min(10).max(15) }))
    .mutation(async ({ input }) => {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min
      await createOtp(input.phone, code, expiresAt);
      // In production: send via Twilio/MSG91. For demo, return code.
      console.log(`[OTP] Phone: ${input.phone} Code: ${code}`);
      return { success: true, devCode: process.env.NODE_ENV !== "production" ? code : undefined };
    }),
  verifyOtp: publicProcedure
    .input(z.object({ phone: z.string(), code: z.string() }))
    .mutation(async ({ input }) => {
      const valid = await verifyOtp(input.phone, input.code);
      return { valid };
    }),
});

// ─── User/Onboarding Router ───────────────────────────────────────────────────
const userRouter = router({
  profile: protectedProcedure.query(async ({ ctx }) => {
    const user = await getUserById(ctx.user.id);
    if (!user) return null;
    let buildingName: string | null = null;
    if (user.buildingId) {
      const building = await getBuildingById(user.buildingId);
      buildingName = building?.name ?? null;
    }
    return { ...user, buildingName };
  }),
  completeOnboarding: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      phone: z.string().optional(),
      buildingId: z.number(),
      flatNumber: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const building = await getBuildingById(input.buildingId);
      const assignedStoreId = building?.primaryStoreId ?? undefined;
      await updateUserProfile(ctx.user.id, {
        name: input.name,
        phone: input.phone,
        buildingId: input.buildingId,
        flatNumber: input.flatNumber,
        assignedStoreId,
        onboardingComplete: true,
      });
      await writeAuditLog(ctx.user.id, "onboarding_complete", "user", ctx.user.id, input);
      return { success: true, assignedStoreId };
    }),
  buildings: publicProcedure.query(() => getBuildings()),
});

// ─── Catalog Router ───────────────────────────────────────────────────────────
const catalogRouter = router({
  list: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      category: z.string().optional(),
      limit: z.number().min(1).max(100).default(60),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const user = await getUserById(ctx.user.id);
      if (!user?.assignedStoreId) return [];
      return getCatalog(user.assignedStoreId, input.search, input.category, input.limit, input.offset);
    }),
  sku: protectedProcedure
    .input(z.object({ skuId: z.number() }))
    .query(async ({ input }) => getSkuById(input.skuId)),
  store: protectedProcedure.query(async ({ ctx }) => {
    const user = await getUserById(ctx.user.id);
    if (!user?.buildingId) return null;
    // Use the routing engine for authoritative store + ETA resolution
    const result = await resolveStore({
      buildingId: user.buildingId,
      mapsApiKey: ENV.googleMapsApiKey || undefined,
    });
    if (!result) {
      // Fallback: return raw store if routing fails
      if (user.assignedStoreId) return getStoreById(user.assignedStoreId);
      return null;
    }
    // Log routing resolution for auditability
    console.info(formatRoutingAuditEntry({ buildingId: user.buildingId }, result));
    const store = await getStoreById(result.storeId);
    return store ? { ...store, etaMins: result.etaMins, displayLabel: result.displayLabel, resolutionPath: result.resolutionPath } : null;
  }),
});

// ─── Routing Router ───────────────────────────────────────────────────────────
const routingRouter = router({
  resolve: protectedProcedure
    .input(z.object({
      requiredSkuIds: z.array(z.number()).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const user = await getUserById(ctx.user.id);
      if (!user?.buildingId) return null;
      const result = await resolveStore({
        buildingId: user.buildingId,
        requiredSkuIds: input.requiredSkuIds,
        mapsApiKey: ENV.googleMapsApiKey || undefined,
      });
      if (result) {
        console.info(formatRoutingAuditEntry(
          { buildingId: user.buildingId, requiredSkuIds: input.requiredSkuIds },
          result
        ));
      }
      return result;
    }),
});

// ─── Cart Router ──────────────────────────────────────────────────────────────
const cartRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => getCart(ctx.user.id)),
  upsert: protectedProcedure
    .input(z.object({ skuId: z.number(), productId: z.number(), variantId: z.number().optional(), quantity: z.number().min(0) }))
    .mutation(async ({ ctx, input }) => {
      await upsertCartItem(ctx.user.id, input.skuId, input.productId, input.quantity);
      return { success: true };
    }),
  clear: protectedProcedure.mutation(async ({ ctx }) => {
    await clearCart(ctx.user.id);
    return { success: true };
  }),
});

// ─── Order Router (shared engine for app + WhatsApp) ─────────────────────────
const orderRouter = router({
  checkout: protectedProcedure
    .input(z.object({ prescriptionId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const user = await getUserById(ctx.user.id);
      if (!user?.assignedStoreId) throw new Error("No assigned store. Complete onboarding first.");
      const cartData = await getCart(ctx.user.id);
      if (cartData.length === 0) throw new Error("Cart is empty");

      const store = await getStoreById(user.assignedStoreId);
      const slaMins = store?.slaMins ?? 20;

      // Apply inventory soft-lock at checkout
      await softLockCart(ctx.user.id);
      await applySoftLockToSkus(cartData.map(i => ({ skuId: i.skuId, qty: i.quantity })));

      const subtotal = cartData.reduce((s, i) => s + parseFloat(String(i.sellingPrice)) * i.quantity, 0);
      const total = subtotal;

      const needsRx = cartData.some(i => i.requiresPrescription);
      const initialStatus = needsRx ? "pharmacist_reviewing" : "picking";

      const orderId = await createOrder({
        userId: ctx.user.id,
        storeId: user.assignedStoreId,
        prescriptionId: input.prescriptionId,
        subtotal: subtotal.toFixed(2),
        total: total.toFixed(2),
        promisedSlaMins: slaMins,
        deliveryAddress: user.flatNumber ? `Flat ${user.flatNumber}` : undefined,
        flatNumber: user.flatNumber ?? undefined,
        buildingId: user.buildingId ?? undefined,
        source: "app",
        items: cartData.map(i => ({
          productId: i.productId,
          variantId: i.variantId ?? undefined,
          storeSkuId: i.skuId,
          quantity: i.quantity,
          unitPrice: String(i.sellingPrice),
          lineTotal: (parseFloat(String(i.sellingPrice)) * i.quantity).toFixed(2),
        })),
      });

      await updateOrderStatus(orderId, initialStatus);
      await clearCart(ctx.user.id);
      await writeAuditLog(ctx.user.id, "order_created", "order", orderId, { source: "app" });

      // Trigger refill reminder update for chronic meds
      for (const item of cartData) {
        if (item.isChronicMedication) {
          // Compute avg interval from actual order history; fallback to 30 days
          const avgIntervalDays = await computeRefillIntervalFromHistory(ctx.user.id, item.productId);
          await upsertRefillReminder(ctx.user.id, item.productId, new Date(), avgIntervalDays);
        }
      }

      return { orderId, status: initialStatus, promisedSlaMins: slaMins };
    }),

  list: protectedProcedure.query(async ({ ctx }) => getOrdersByUser(ctx.user.id)),

  detail: protectedProcedure
    .input(z.object({ orderId: z.number() }))
    .query(async ({ ctx, input }) => {
      const order = await getOrderById(input.orderId);
      if (!order || order.userId !== ctx.user.id) throw new Error("Order not found");
      const items = await getOrderItems(input.orderId);
      return { ...order, items };
    }),

  reorder: protectedProcedure
    .input(z.object({ orderId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const order = await getOrderById(input.orderId);
      if (!order || order.userId !== ctx.user.id) throw new Error("Order not found");
      // Use getOrderItemsForReorder which includes storeSkuId
      const items = await getOrderItemsForReorder(input.orderId);
      await clearCart(ctx.user.id);
      for (const item of items) {
        // item.storeSkuId is the correct SKU id, item.productId is the product
        await upsertCartItem(ctx.user.id, item.storeSkuId, item.productId, item.quantity);
      }
      await writeAuditLog(ctx.user.id, "order_reorder", "order", input.orderId, {});
      return { success: true, itemCount: items.length };
    }),

  // Admin/demo: advance order status
  advanceStatus: protectedProcedure
    .input(z.object({ orderId: z.number(), status: z.enum(["pharmacist_reviewing", "picking", "out_for_delivery", "delivered", "cancelled"]) }))
    .mutation(async ({ ctx, input }) => {
      const order = await getOrderById(input.orderId);
      if (!order) throw new Error("Order not found");
      await updateOrderStatus(input.orderId, input.status);
      await writeAuditLog(ctx.user.id, "order_status_changed", "order", input.orderId, { status: input.status });
      // Auto-generate invoice on delivery
      if (input.status === "delivered") {
        try {
          await generateAndStoreInvoice(input.orderId, async (key, data, mime) => {
            return storagePut(key, data, mime);
          });
        } catch (e) {
          console.error("[Invoice] Failed to generate invoice for order", input.orderId, e);
        }
      }
      return { success: true };
    }),
});

// ─── Prescription Router ──────────────────────────────────────────────────────
const prescriptionRouter = router({
  upload: protectedProcedure
    .input(z.object({
      imageBase64: z.string(),
      mimeType: z.string().default("image/jpeg"),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await getUserById(ctx.user.id);
      const buffer = Buffer.from(input.imageBase64, "base64");
      const key = `prescriptions/${ctx.user.id}/${Date.now()}.jpg`;
      const { url } = await storagePut(key, buffer, input.mimeType);
      const rxId = await createPrescription(ctx.user.id, user?.assignedStoreId ?? undefined, url, key);
      await writeAuditLog(ctx.user.id, "prescription_uploaded", "prescription", rxId);
      return { prescriptionId: rxId, imageUrl: url };
    }),
  list: protectedProcedure.query(async ({ ctx }) => getPrescriptionsByUser(ctx.user.id)),
  detail: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const rx = await getPrescriptionById(input.id);
      if (!rx || rx.userId !== ctx.user.id) throw new Error("Not found");
      return rx;
    }),
});

// ─── Refill Reminders Router ──────────────────────────────────────────────────
const refillRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => getRefillReminders(ctx.user.id)),
  dismiss: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await dismissRefillReminder(input.id, ctx.user.id);
      return { success: true };
    }),
});

// ─── WhatsApp Bot Router (shared order engine) ────────────────────────────────
const whatsappRouter = router({
  webhook: publicProcedure
    .input(z.object({
      phone: z.string(),
      message: z.string(),
      messageType: z.enum(["text", "image", "button"]).default("text"),
      imageUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const session = await getWhatsappSession(input.phone);
      const flow = session?.currentFlow ?? "menu";
      const state = session?.flowState ? JSON.parse(session.flowState) : {};

      // Simple state machine for WhatsApp flows
      let response = "";
      let nextFlow = flow;
      let nextState = state;

      if (input.message.toLowerCase() === "hi" || input.message.toLowerCase() === "hello" || flow === "menu") {
        response = "Welcome to 24/7 Pharmacy.\n\nReply with:\n1. Search medicines\n2. My orders\n3. Upload prescription\n4. Reorder last order\n5. Refill reminders";
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
        if (flow !== "status" || !state.awaitingOrderId) {
          response = "Please enter your Order ID (e.g. 1234):";
          nextFlow = "status";
          nextState = { awaitingOrderId: true };
        } else {
          const orderId = parseInt(input.message);
          if (!isNaN(orderId)) {
            const order = await getOrderById(orderId);
            if (order) {
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
            response = "Invalid order ID. Reply \"hi\" for main menu.";
          }
          nextFlow = "menu";
          nextState = {};
        }
      } else if (input.message === "3" || flow === "rx_upload") {
        if (input.messageType === "image" && input.imageUrl) {
          // Persist Rx into the shared prescriptions table
          try {
            const key = `whatsapp-rx/${input.phone}-${Date.now()}.jpg`;
            await createWhatsappPrescription(input.phone, input.imageUrl, key);
          } catch (e) {
            console.error("[WhatsApp] Failed to persist Rx:", e);
          }
          response = "Prescription received and saved. Our pharmacist will review it shortly.\n\nReply \"hi\" for main menu.";
          nextFlow = "menu";
          nextState = {};
        } else {
          response = "Please send your prescription as an image (photo of the prescription).";
          nextFlow = "rx_upload";
          nextState = { awaitingImage: true };
        }
      } else if (input.message === "4") {
        response = "To reorder, please open the 24/7 app and tap 'Reorder' on any past order.\n\nReply \"hi\" for main menu.";
        nextFlow = "menu";
        nextState = {};
      } else if (input.message === "5") {
        response = "Your refill reminders are available in the 24/7 app under 'Refills'.\n\nReply \"hi\" for main menu.";
        nextFlow = "menu";
        nextState = {};
      } else {
        response = "I didn't understand that. Reply \"hi\" to see the main menu.";
        nextFlow = "menu";
        nextState = {};
      }

      await upsertWhatsappSession(input.phone, {
        currentFlow: nextFlow,
        flowState: JSON.stringify(nextState),
      });

      return { response };
    }),
});

// ─── App Router ───────────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  user: userRouter,
  catalog: catalogRouter,
  routing: routingRouter,
  cart: cartRouter,
  orders: orderRouter,
  prescriptions: prescriptionRouter,
  refills: refillRouter,
  whatsapp: whatsappRouter,
});

export type AppRouter = typeof appRouter;
