import { z } from "zod";
import { COOKIE_NAME, ONBOARDING_REQUIRED_MSG } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router, requireOrderOwnershipOrStaff, requireAnyRole, isStaffRole, PHARMACIST_ROLES, RIDER_ROLES, STAFF_ROLES } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  getBuildings, getStoreById, getCatalog, getSkuById,
  getCart, upsertCartItem, clearCart, softLockCart, releaseCartLock, applySoftLockToSkus, releaseSoftLock,
  createOrder, getOrdersByUser, getOrderById, getOrderItems, updateOrderStatus, updateOrderInvoice,
  createPrescription, getPrescriptionsByUser, getPrescriptionById,
  getRefillReminders, dismissRefillReminder, upsertRefillReminder,
  getUserById, updateUserProfile, writeAuditLog, createOtp, verifyOtp,
  upsertUserByPhone, getUserByPhone,
  getWhatsappSession, upsertWhatsappSession, getBuildingById,
  computeRefillIntervalFromHistory, getOrderItemsForReorder,
  createWhatsappPrescription, generateAndStoreInvoice,
  getPrescriptionVault, markPrescriptionOnFile, getActivePriorApprovals,
  getSponsoredShelf, snoozeRefillReminder, getSnoozedReminders,
  createConsultRequest, getConsultRequests, linkConsultPrescription,
} from "./db";
import { storagePut } from "./storage";
import { ENV } from "./_core/env";
import { redactSensitive } from "./_core/redact";
import { resolveStore, formatRoutingAuditEntry } from "./routing";
import { getPlaceAutocomplete, geocodeAddress, checkServiceability } from "./location";
import { pharmacistRouter, inventoryRouter, vendorRouter, staffRouter, riderRouter, metricsRouter } from "./routers/pharmacyRouter";
import { ingestionRouter } from "./routers/ingestionRouter";
import { helpdeskRouter } from "./routers/helpdeskRouter";
import { consentRouter } from "./routers/consentRouter";
import { paymentRouter } from "./routers/paymentRouter";
import { medivisionRouter } from "./routers/medivisionRouter";
import { masterDataRouter } from "./routers/masterDataRouter";
import { inventoryLedgerRouter } from "./routers/inventoryRouter";
import { purchaseRouter } from "./routers/purchaseRouter";
import { salesRouter } from "./routers/salesRouter";
import { prescriptionGovRouter } from "./routers/prescriptionGovRouter";
import { ocrIngestionRouter } from "./routers/ocrIngestionRouter";
import { reportsRouter } from "./routers/reportsRouter";
import { customerMedicineRouter } from "./routers/customerMedicineRouter";
import { whatsappFullRouter } from "./routers/whatsappRouter";
import { deliveryRouter } from "./routers/deliveryRouter";
import { commandCenterRouter } from "./routers/commandCenterRouter";
import { tplOrderReceived, alertNewOrder } from "./notifications";

import { createNotification, getCustomerNotifications, getNotificationPreferences, updateNotificationPreferences } from "./services/notificationService";
import { createReorderPrompt } from "./services/refillReminderService";
import { createDosageSchedule, getTodayDosePlan, recordDoseTaken, recordDoseSkipped, getAdherenceSummary, estimateMedicationRemaining, estimateRunoutDate } from "./services/dosageTracking";
import { createOrderRating, updateOrderRating, getOrderRating, __markOrderDeliveredForTest } from "./services/orderRating";

// ─── Auth Router ──────────────────────────────────────────────────────────────
const otpRateLimit = new Map<string, { count: number; ts: number }>();
const otpVerifyFailures = new Map<string, { count: number; ts: number }>();

function assertOtpLimiterMode() {
  const mode = (process.env.OTP_RATE_LIMIT_BACKEND ?? "").trim();
  if (ENV.isProduction && mode !== "database" && mode !== "memory_allowed_for_single_instance") {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "OTP disabled: OTP_RATE_LIMIT_BACKEND must be set for production" });
  }
}

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
      assertOtpLimiterMode();
      const now = Date.now();
      const slot = otpRateLimit.get(input.phone);
      if (slot && now - slot.ts < 15 * 60 * 1000 && slot.count >= 5) {
        console.warn("auth.otp_rate_limited", redactSensitive(input.phone));
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many OTP requests" });
      }
      otpRateLimit.set(input.phone, { count: (slot?.count ?? 0) + 1, ts: slot?.ts ?? now });
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min
      await createOtp(input.phone, code, expiresAt);
      console.info("auth.otp_requested");
      return { success: true, devCode: !ENV.isProduction ? code : undefined };
    }),
  verifyOtp: publicProcedure
    .input(z.object({ phone: z.string(), code: z.string() }))
    .mutation(async ({ input, ctx }) => {
      assertOtpLimiterMode();
      const failSlot = otpVerifyFailures.get(input.phone);
      const now = Date.now();
      if (failSlot && now - failSlot.ts < 15 * 60 * 1000 && failSlot.count >= 8) {
        console.warn("auth.otp_rate_limited", redactSensitive(input.phone));
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many OTP verification attempts" });
      }
      const valid = await verifyOtp(input.phone, input.code);
      if (!valid) {
        otpVerifyFailures.set(input.phone, { count: (failSlot?.count ?? 0) + 1, ts: failSlot?.ts ?? now });
        console.warn("auth.otp_failed", redactSensitive(input.phone));
        return { valid: false as const };
      }
      otpVerifyFailures.delete(input.phone);
      console.info("auth.otp_verified");

      // Upsert the user record keyed by phone
      const { id: userId } = await upsertUserByPhone(input.phone, { loginMethod: "phone" });
      const user = await getUserByPhone(input.phone);
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create user" });

      // Create a session JWT and set the cookie — same mechanism as OAuth callback
      const { sdk } = await import("./_core/sdk");
      // Use phone as the stable identifier (openId may be null for phone users)
      const sessionToken = await sdk.signSession(
        { openId: `phone:${input.phone}`, appId: ENV.appId, name: user.name ?? "" },
        { expiresInMs: 1000 * 60 * 60 * 24 * 365 }
      );
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: 1000 * 60 * 60 * 24 * 365 });

      return {
        valid: true as const,
        onboardingComplete: user.onboardingComplete,
        assignedStoreId: user.assignedStoreId,
      };
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
      // Building-based onboarding
      buildingId: z.number().optional(),
      flatNumber: z.string().optional(),
      // Address-based onboarding (when user types a free-form address)
      userAddress: z.string().optional(),
      userLat: z.number().optional(),
      userLng: z.number().optional(),
      // Frontend hint only; server resolves the authoritative store.
      assignedStoreId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Validate: must have either buildingId or (userAddress + coordinates)
      if (!input.buildingId && (!input.userAddress || input.userLat === undefined || input.userLng === undefined)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Either a building selection or a valid address with coordinates is required.",
        });
      }
      // If building-based, validate the building exists
      if (input.buildingId) {
        const building = await getBuildingById(input.buildingId);
        if (!building) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Building not found" });
        }
      }
      let resolvedStoreId: number | undefined;
      if (input.buildingId) {
        const result = await resolveStore({ buildingId: input.buildingId });
        if (!result) throw new TRPCError({ code: "BAD_REQUEST", message: "No serviceable store found for building" });
        resolvedStoreId = result.storeId;
      } else if (input.userLat !== undefined && input.userLng !== undefined) {
        const svc = await checkServiceability(input.userLat, input.userLng);
        if (!svc?.serviceable || !svc.storeId) throw new TRPCError({ code: "BAD_REQUEST", message: "Address not serviceable" });
        resolvedStoreId = svc.storeId;
      }

      if (!resolvedStoreId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No serviceable store found for address" });
      }

      await updateUserProfile(ctx.user.id, {
        name: input.name,
        phone: input.phone,
        buildingId: input.buildingId,
        flatNumber: input.flatNumber,
        userAddress: input.userAddress,
        userLat: input.userLat !== undefined ? String(input.userLat) : undefined,
        userLng: input.userLng !== undefined ? String(input.userLng) : undefined,
        assignedStoreId: resolvedStoreId,
        onboardingComplete: true,
      });
      await writeAuditLog(ctx.user.id, "onboarding_complete", "user", ctx.user.id, input);
      return { success: true, assignedStoreId: resolvedStoreId };
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
      // Guard: require completed onboarding before catalog access
      if (!user?.onboardingComplete || !user?.assignedStoreId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: ONBOARDING_REQUIRED_MSG,
        });
      }
      return getCatalog(user.assignedStoreId, input.search, input.category, input.limit, input.offset);
    }),
  sku: protectedProcedure
    .input(z.object({ skuId: z.number() }))
    .query(async ({ input }) => getSkuById(input.skuId)),
  /** Sponsored shelf — OTC/wellness/nutrition/devices/personal care only, never Rx */
  sponsored: protectedProcedure.query(async ({ ctx }) => {
    const user = await getUserById(ctx.user.id);
    if (!user?.onboardingComplete || !user?.assignedStoreId) return [];
    return getSponsoredShelf(user.assignedStoreId, 8);
  }),
  store: protectedProcedure.query(async ({ ctx }) => {
    const user = await getUserById(ctx.user.id);
    // Guard: require completed onboarding
    if (!user?.onboardingComplete || !user?.assignedStoreId) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: ONBOARDING_REQUIRED_MSG,
      });
    }
    // For users without building assignment, return their assigned store directly
    if (!user?.buildingId) {
      if (user?.assignedStoreId) return getStoreById(user.assignedStoreId);
      return null;
    }
    // Use the routing engine for authoritative store + ETA resolution
    const result = await resolveStore({
      buildingId: user.buildingId,
    });
    if (!result) {
      // Fallback: return raw store if routing fails
      if (user.assignedStoreId) return getStoreById(user.assignedStoreId);
      return null;
    }
    // Log routing resolution for auditability
    console.info(formatRoutingAuditEntry({ buildingId: user.buildingId }, result));
    const store = await getStoreById(result.storeId);
    return store ? { ...store, etaMins: result.etaMins, etaText: result.etaText, slaMins: result.slaMins, openNow: result.openNow, openingHoursText: result.openingHoursText, displayLabel: result.displayLabel, resolutionPath: result.resolutionPath } : null;
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
    .input(z.object({ skuId: z.number(), productId: z.number().optional(), variantId: z.number().optional(), quantity: z.number().min(0) }))
    .mutation(async ({ ctx, input }) => {
      const sku = await getSkuById(input.skuId);
      if (!sku) throw new TRPCError({ code: "NOT_FOUND", message: "SKU not found" });

      const user = await getUserById(ctx.user.id);
      if (!user?.onboardingComplete || !user?.assignedStoreId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: ONBOARDING_REQUIRED_MSG,
        });
      }
      if (sku.storeId !== user.assignedStoreId) throw new TRPCError({ code: "FORBIDDEN", message: "SKU not available for your assigned store" });
      if (!sku.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "SKU is inactive" });
      if (input.productId && input.productId !== sku.productId) throw new TRPCError({ code: "BAD_REQUEST", message: "Product mismatch for SKU" });
      if (input.quantity > 0 && Number(sku.availableQty ?? 0) < input.quantity) throw new TRPCError({ code: "BAD_REQUEST", message: "Requested quantity unavailable" });
      await upsertCartItem(ctx.user.id, input.skuId, sku.productId, input.quantity);
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
      if (!user?.onboardingComplete || !user?.assignedStoreId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: ONBOARDING_REQUIRED_MSG,
        });
      }
      const cartData = await getCart(ctx.user.id);
      if (cartData.length === 0) throw new Error("Cart is empty");

      const store = await getStoreById(user.assignedStoreId);
      const slaMins = store?.slaMins ?? 20;

      const lockItems = cartData.map(i => ({ skuId: i.skuId, qty: i.quantity }));
      for (const item of cartData) {
        const sku = await getSkuById(item.skuId);
        if (!sku || !sku.isActive || sku.storeId !== user.assignedStoreId || sku.productId !== item.productId || Number(sku.availableQty ?? 0) < item.quantity) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Cart contains unavailable items" });
        }
      }

      const subtotal = cartData.reduce((s, i) => s + parseFloat(String(i.sellingPrice)) * i.quantity, 0);
      const total = subtotal;

      const needsRx = cartData.some(i => i.requiresPrescription);
      // Rx gate: if cart contains Rx/H/H1/X items, prescriptionId is required
      if (needsRx) {
        if (!input.prescriptionId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A valid prescription is required for one or more items in your cart. Please upload your prescription before checkout.",
          });
        }
        // Verify prescription belongs to this customer
        const rx = await getPrescriptionById(input.prescriptionId);
        if (!rx || rx.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Prescription does not belong to this account" });
        }
        if (rx.status === "rejected") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This prescription has been rejected. Please upload a new prescription." });
        }
      }
      // Initial status: Rx orders enter pharmacist review; OTC orders go to awaiting_allocation
      const initialStatus = needsRx ? "awaiting_pharmacist_review" : "awaiting_allocation";
      let orderId: number | null = null;
      await softLockCart(ctx.user.id);
      await applySoftLockToSkus(lockItems);
      try {
        orderId = await createOrder({
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

        // Fire-and-forget: send order confirmation notification
        const notifPayload = tplOrderReceived({
          orderId,
          customerName: user.name ?? "Customer",
          itemCount: cartData.length,
          totalAmount: total.toFixed(2),
          storeName: store?.name ?? "24/7 Pharmacy",
        });
        alertNewOrder({
          orderId,
          storeName: store?.name ?? "24/7 Pharmacy",
          totalAmount: total.toFixed(2),
          itemCount: cartData.length,
        }).catch(() => {}); // non-blocking ops alert
        console.log(`[Notification] ${notifPayload.title}: ${notifPayload.content}`);

        // Trigger refill reminder update for chronic meds
        for (const item of cartData) {
          if (item.isChronicMedication) {
            // Compute avg interval from actual order history; fallback to 30 days
            const avgIntervalDays = await computeRefillIntervalFromHistory(ctx.user.id, item.productId);
            await upsertRefillReminder(ctx.user.id, item.productId, new Date(), avgIntervalDays);
          }
        }

        return { orderId, status: initialStatus, promisedSlaMins: slaMins };
      } catch (error) {
        await releaseSoftLock(lockItems);
        await releaseCartLock(ctx.user.id);
        throw error;
      }
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

  // Advance order status — role-gated, reason required, audit logged
  advanceStatus: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      status: z.enum([
        "draft", "awaiting_prescription", "awaiting_pharmacist_review",
        "clarification_needed", "rejected", "awaiting_allocation",
        "backorder_review", "reserved", "picking", "packed",
        "assigned_to_rider", "out_for_delivery", "delivery_exception",
        "returned", "delivered", "closed", "cancelled",
        // legacy compat
        "pharmacist_reviewing", "return_to_stock",
      ]),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const order = await getOrderById(input.orderId);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
      const userRole = ctx.user.role;
      // Customers cannot advance operational statuses
      const customerOnlyStatuses = ["cancelled"];
      const staffOnlyStatuses = [
        "awaiting_pharmacist_review", "clarification_needed", "rejected",
        "awaiting_allocation", "backorder_review", "reserved",
        "picking", "packed", "assigned_to_rider", "out_for_delivery",
        "delivery_exception", "returned", "delivered", "closed",
        // legacy
        "pharmacist_reviewing", "return_to_stock",
      ];
      if (staffOnlyStatuses.includes(input.status) && !isStaffRole(userRole)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only staff can advance to this status" });
      }
      // Customers can only cancel their own orders
      if (!isStaffRole(userRole) && input.status !== "cancelled") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Customers can only cancel orders" });
      }
      requireOrderOwnershipOrStaff(ctx.user.id, order.userId, userRole);
      const before = { status: order.status };
      await updateOrderStatus(input.orderId, input.status, { reason: input.reason, changedBy: ctx.user.id });
      await writeAuditLog(ctx.user.id, "order_status_changed", "order", input.orderId, undefined, {
        actorRole: userRole,
        beforeJson: before,
        afterJson: { status: input.status },
        reason: input.reason,
        channel: 'admin',
      });
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
      const allowed: Record<string, {ext:string; magic:number[]}> = {"image/jpeg":{ext:"jpg",magic:[0xFF,0xD8,0xFF]},"image/png":{ext:"png",magic:[0x89,0x50,0x4E,0x47]},"application/pdf":{ext:"pdf",magic:[0x25,0x50,0x44,0x46]}};
      const rule = allowed[input.mimeType];
      if (!rule) throw new TRPCError({ code: "BAD_REQUEST", message: "Unsupported file type" });
      if (buffer.length > 8 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "File too large" });
      if (!rule.magic.every((b,i)=>buffer[i]===b)) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid file signature" });
      const key = `prescriptions/${ctx.user.id}/${Date.now()}.${rule.ext}`;
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
      if (!rx || rx.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });
      await writeAuditLog(ctx.user.id, "prescription_viewed", "prescription", input.id, undefined, { channel: "app" });
      return rx;
    }),
  /** Prescription vault — approved + on-file prescriptions */
  vault: protectedProcedure.query(async ({ ctx }) => getPrescriptionVault(ctx.user.id)),
  /** Mark an approved prescription as permanently on-file */
  markOnFile: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const rx = await getPrescriptionById(input.id);
      if (!rx || rx.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });
      if (rx.status !== "approved") throw new TRPCError({ code: "BAD_REQUEST", message: "Only approved prescriptions can be stored on file" });
      await markPrescriptionOnFile(input.id, ctx.user.id);
      await writeAuditLog(ctx.user.id, "prescription_marked_on_file", "prescription", input.id);
      return { success: true };
    }),
  /** Active prior approvals for the current user */
  priorApprovals: protectedProcedure.query(async ({ ctx }) => getActivePriorApprovals(ctx.user.id)),
});

// ─── Refill Reminders Router ──────────────────────────────────────────────────
const refillRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => getRefillReminders(ctx.user.id)),
  due: protectedProcedure.query(async ({ ctx }) => getRefillReminders(ctx.user.id)),
  dismiss: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await dismissRefillReminder(input.id, ctx.user.id);
      return { success: true };
    }),
  markRefilled: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await dismissRefillReminder(input.id, ctx.user.id);
      return { success: true, status: "refilled" as const };
    }),
  /** Snooze a refill reminder for N days (1, 3, or 7) */
  snooze: protectedProcedure
    .input(z.object({ id: z.number(), days: z.union([z.literal(1), z.literal(3), z.literal(7)]) }))
    .mutation(async ({ ctx, input }) => {
      await snoozeRefillReminder(input.id, ctx.user.id, input.days);
      return { success: true };
    }),
  createReorderPrompt: protectedProcedure
    .input(z.object({ reminderId: z.number(), productId: z.number(), regulated: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      const pseudo = { id: String(input.reminderId), customerId: ctx.user.id, productId: input.productId, nextRefillDate: new Date().toISOString().slice(0,10), regulated: input.regulated };
      if (input.regulated) {
        await writeAuditLog(ctx.user.id, "refill.regulated_review_required", "refill", input.reminderId, undefined, { channel: "app", payload: { productId: input.productId } });
      }
      // foundation flow: prompt only, no order state mutation
      return { promptId: `draft_prompt_${input.reminderId}_${Date.now()}`, reminderId: input.reminderId, productId: input.productId, complianceGateRequired: input.regulated, autoConfirmedSale: false, status: "draft_prompt", requiresPharmacistReview: input.regulated, persistence: "pending_table_mapping" as const };
    }),
  /** Snoozed reminders — those with snoozedUntil > now */
  listSnoozed: protectedProcedure.query(async ({ ctx }) => getSnoozedReminders(ctx.user.id)),
});


const notificationRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => ({ rows: await getCustomerNotifications(ctx.user.id), persistence: "db_backed" as const })),
  preferences: protectedProcedure.query(async ({ ctx }) => await getNotificationPreferences(ctx.user.id)),
  updatePreferences: protectedProcedure.input(z.object({ allowSensitiveInUnsafeChannels: z.boolean().optional(), channels: z.record(z.enum(["in_app","push","email","whatsapp","sms"]), z.boolean()).optional() })).mutation(async ({ ctx, input }) => await updateNotificationPreferences(ctx.user.id, input as any)),
  createTest: protectedProcedure.input(z.object({ channel: z.enum(["in_app","push","email","whatsapp","sms"]), title: z.string(), body: z.string(), sensitive: z.boolean().default(false) })).mutation(async ({ ctx, input }) => await createNotification({ customerId: ctx.user.id, channel: input.channel, title: input.title, body: input.body, sensitive: input.sensitive }))
});

const dosageRouter = router({
  createSchedule: protectedProcedure.input(z.object({ productId: z.number(), unitsPerDay: z.number().positive(), totalUnits: z.number().positive(), source: z.enum(["prescription","user","pharmacist"]).default("user") })).mutation(async ({ ctx, input }) => await createDosageSchedule({ customerId: ctx.user.id, ...input })),
  todayPlan: protectedProcedure.query(async ({ ctx }) => await getTodayDosePlan(ctx.user.id, new Date().toISOString().slice(0,10))),
  recordTaken: protectedProcedure.input(z.object({ scheduleId: z.string(), date: z.string() })).mutation(async ({ ctx, input }) => ({ ok: await recordDoseTaken(ctx.user.id, input.scheduleId, input.date) })),
  recordSkipped: protectedProcedure.input(z.object({ scheduleId: z.string(), date: z.string() })).mutation(async ({ ctx, input }) => ({ ok: await recordDoseSkipped(ctx.user.id, input.scheduleId, input.date) })),
  adherence: protectedProcedure.input(z.object({ scheduleId: z.string() })).query(async ({ ctx, input }) => await getAdherenceSummary(ctx.user.id, input.scheduleId)),
  remaining: protectedProcedure.input(z.object({ scheduleId: z.string(), startDate: z.string() })).query(async ({ ctx, input }) => ({ remaining: await estimateMedicationRemaining(ctx.user.id, input.scheduleId), runoutDate: await estimateRunoutDate(ctx.user.id, input.scheduleId, input.startDate), persistence: "db_backed" as const })),
});

const ratingRouter = router({
  create: protectedProcedure.input(z.object({ orderId: z.number(), overall: z.number().min(1).max(5), delivery: z.number().min(1).max(5).optional(), packaging: z.number().min(1).max(5).optional(), pharmacistSupport: z.number().min(1).max(5).optional(), availability: z.number().min(1).max(5).optional(), issueTags: z.array(z.string()).optional(), comment: z.string().optional() })).mutation(async ({ ctx, input }) => {
    const order = await getOrderById(input.orderId);
    if (!order || order.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });
    if (!["delivered", "completed"].includes(order.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "Order not eligible for rating" });
    return await createOrderRating({ ...input, customerId: ctx.user.id });
  }),
  update: protectedProcedure.input(z.object({ orderId: z.number(), updates: z.object({ overall: z.number().min(1).max(5).optional(), delivery: z.number().min(1).max(5).optional(), packaging: z.number().min(1).max(5).optional(), pharmacistSupport: z.number().min(1).max(5).optional(), availability: z.number().min(1).max(5).optional(), issueTags: z.array(z.string()).optional(), comment: z.string().optional() }) })).mutation(async ({ ctx, input }) => await updateOrderRating(input.orderId, ctx.user.id, input.updates)),
  get: protectedProcedure.input(z.object({ orderId: z.number() })).query(async ({ ctx, input }) => await getOrderRating(input.orderId, ctx.user.id)),
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
      assertOtpLimiterMode();
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
// ─── Location Router ─────────────────────────────────────────────────────────
const locationRouter = router({
  /**
   * Places Autocomplete — returns address suggestions as user types.
   * Used in the onboarding address search field.
   */
  autocomplete: publicProcedure
    .input(z.object({
      query: z.string().min(1).max(200),
      sessionToken: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return getPlaceAutocomplete(input.query, input.sessionToken);
    }),

  /**
   * Geocode a place_id (from autocomplete) or a free-text address to lat/lng.
   */
  geocode: publicProcedure
    .input(z.object({
      placeId: z.string().optional(),
      address: z.string().optional(),
    }))
    .query(async ({ input }) => {
      if (input.placeId) {
        return geocodeAddress(input.placeId, true);
      }
      if (input.address) {
        return geocodeAddress(input.address, false);
      }
      return null;
    }),

  /**
   * Serviceability check — given lat/lng (and optional buildingId),
   * returns the nearest eligible store and ETA, or serviceable=false.
   */
  checkServiceability: publicProcedure
    .input(z.object({
      lat: z.number(),
      lng: z.number(),
      buildingPrimaryStoreId: z.number().optional(),
      pincode: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return checkServiceability(
        input.lat,
        input.lng,
        input.buildingPrimaryStoreId,
        input.pincode
      );
    }),
});

// ─── Doctor Consult Router ───────────────────────────────────────────────────
const consultRouter = router({
  // Request a new doctor consult
  request: protectedProcedure
    .input(z.object({
      chiefComplaint: z.string().min(5).max(1000),
      consultType: z.enum(["instant", "scheduled"]).default("instant"),
    }))
    .mutation(async ({ ctx, input }) => {
      const consult = await createConsultRequest(
        ctx.user.id,
        input.chiefComplaint,
        input.consultType
      );
      return consult;
    }),

  // List all consult requests for the current user
  list: protectedProcedure.query(async ({ ctx }) => {
    return getConsultRequests(ctx.user.id);
  }),

  // Link a prescription to a completed consult
  linkPrescription: protectedProcedure
    .input(z.object({
      consultId: z.number().int().positive(),
      prescriptionId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      await linkConsultPrescription(input.consultId, ctx.user.id, input.prescriptionId);
      return { ok: true };
    }),
});

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  user: userRouter,
  location: locationRouter,
  catalog: catalogRouter,
  routing: routingRouter,
  cart: cartRouter,
  orders: orderRouter,
  prescriptions: prescriptionRouter,
  refills: refillRouter,
  notifications: notificationRouter,
  dosage: dosageRouter,
  ratings: ratingRouter,
  whatsapp: whatsappRouter,
  pharmacist: pharmacistRouter,
  inventory: inventoryRouter,
  vendor: vendorRouter,
  staff: staffRouter,
  rider: riderRouter,
  metrics: metricsRouter,
  ingestion: ingestionRouter,
  helpdesk: helpdeskRouter,
  consent: consentRouter,
  consult: consultRouter,
  payment: paymentRouter,
  medivision: medivisionRouter,
  masterData: masterDataRouter,
  inventoryLedger: inventoryLedgerRouter,
  purchase: purchaseRouter,
  sales: salesRouter,
  ocr: ocrIngestionRouter,
  reports: reportsRouter,
  prescriptionGov: prescriptionGovRouter,
  customerMedicine: customerMedicineRouter,
  whatsappFull: whatsappFullRouter,
  delivery: deliveryRouter,
  commandCenter: commandCenterRouter,
});

export type AppRouter = typeof appRouter;
