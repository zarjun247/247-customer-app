import { z } from "zod";
import { ONBOARDING_REQUIRED_MSG } from "@shared/const";
import { systemRouter } from "./_core/systemRouter";
import {
  protectedProcedure,
  customerMutationProcedure,
  publicProcedure,
  router,
} from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  getStoreById,
  getCatalog,
  getSkuById,
  getCart,
  upsertCartItem,
  clearCart,
  getRefillReminders,
  dismissRefillReminder,
  getUserById,
  writeAuditLog,
  getSponsoredShelf,
  snoozeRefillReminder,
  getSnoozedReminders,
  createConsultRequest,
  getConsultRequests,
  linkConsultPrescription,
} from "./db";
import { ENV } from "./_core/env";
import { resolveStore, formatRoutingAuditEntry } from "./routing";
import { getCanonicalAvailability as getCanonicalAvailabilityLedger } from "./services/canonicalAvailability";
import {
  getPlaceAutocomplete,
  geocodeAddress,
  checkServiceability,
} from "./location";
import {
  createNotification,
  getCustomerNotifications,
  getNotificationPreferences,
  updateNotificationPreferences,
} from "./services/notificationService";
import {
  createDosageSchedule,
  getTodayDosePlan,
  recordDoseTaken,
  recordDoseSkipped,
  getAdherenceSummary,
  estimateMedicationRemaining,
  estimateRunoutDate,
} from "./services/dosageTracking";
import {
  pharmacistRouter,
  inventoryRouter,
  vendorRouter,
  staffRouter,
  riderRouter,
  metricsRouter,
} from "./routers/pharmacyRouter";
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
import { accountingOpsRouter } from "./routers/accountingOpsRouter";
import { complianceOpsRouter } from "./routers/complianceOpsRouter";
import { reconciliationRouter } from "./routers/reconciliationRouter";
import { multiStoreRuntimeRouter } from "./routers/multiStoreRuntimeRouter";
import { deploymentReadinessRouter } from "./routers/deploymentReadinessRouter";
import { customerMedicineRouter } from "./routers/customerMedicineRouter";
import { whatsappFullRouter } from "./routers/whatsappRouter";
import { deliveryRouter } from "./routers/deliveryRouter";
import { commandCenterRouter } from "./routers/commandCenterRouter";
import { deadLetterRouter } from "./routers/deadLetterRouter";
import { providerHealthRouter } from "./routers/providerHealthRouter";
import { onCallRouter } from "./routers/onCallRouter";
import { deploymentRouter } from "./routers/deploymentRouter";
import { chaosRouter } from "./routers/chaosRouter";
import { restoreDrillRouter } from "./routers/restoreDrillRouter";
import { commandLogRouter } from "./routers/commandLogRouter";
import { outboxRouter } from "./routers/outboxRouter";
import { reservationRouter } from "./routers/reservationRouter";
import { availabilityRouter } from "./routers/availabilityRouter";
import { securityRouter } from "./routers/securityRouter";
import { intelligenceRouter } from "./routers/intelligenceRouter";
import { aiEvalRouter } from "./routers/aiEvalRouter";
import { dsrRouter } from "./routers/dsrRouter";
import { dsrAdminRouter } from "./routers/dsrAdminRouter";
import { authRouter } from "./routers/authRouter";
import { userRouter } from "./routers/userRouter";
import { orderRouter } from "./routers/orderRouter";
import { prescriptionRouter } from "./routers/prescriptionRouter";
import { customerWhatsappRouter } from "./routers/customerWhatsappRouter";
import { ratingRouter } from "./routers/ratingRouter";

// ─── Catalog Router ───────────────────────────────────────────────────────────
const catalogRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        category: z.string().optional(),
        limit: z.number().min(1).max(100).default(60),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const user = await getUserById(ctx.user.id);
      if (!user?.onboardingComplete || !user?.assignedStoreId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: ONBOARDING_REQUIRED_MSG,
        });
      }
      return getCatalog(
        user.assignedStoreId,
        input.search,
        input.category,
        input.limit,
        input.offset
      );
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
    if (!user?.onboardingComplete || !user?.assignedStoreId) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: ONBOARDING_REQUIRED_MSG,
      });
    }
    if (!user?.buildingId) {
      if (user?.assignedStoreId) return getStoreById(user.assignedStoreId);
      return null;
    }
    const result = await resolveStore({
      buildingId: user.buildingId,
    });
    if (!result) {
      if (user.assignedStoreId) return getStoreById(user.assignedStoreId);
      return null;
    }
    console.info(
      formatRoutingAuditEntry({ buildingId: user.buildingId }, result)
    );
    const store = await getStoreById(result.storeId);
    return store
      ? {
          ...store,
          etaMins: result.etaMins,
          etaText: result.etaText,
          slaMins: result.slaMins,
          openNow: result.openNow,
          openingHoursText: result.openingHoursText,
          displayLabel: result.displayLabel,
          resolutionPath: result.resolutionPath,
        }
      : null;
  }),
});

// ─── Routing Router ───────────────────────────────────────────────────────────
const routingRouter = router({
  resolve: protectedProcedure
    .input(
      z.object({
        requiredSkuIds: z.array(z.number()).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const user = await getUserById(ctx.user.id);
      if (!user?.buildingId) return null;
      const result = await resolveStore({
        buildingId: user.buildingId,
        requiredSkuIds: input.requiredSkuIds,
      });
      if (result) {
        console.info(
          formatRoutingAuditEntry(
            {
              buildingId: user.buildingId,
              requiredSkuIds: input.requiredSkuIds,
            },
            result
          )
        );
      }
      return result;
    }),
});

// ─── Cart Router ──────────────────────────────────────────────────────────────
const cartRouter = router({
  /** Returns the current user's active cart with all line items and computed totals. */
  get: protectedProcedure.query(async ({ ctx }) => getCart(ctx.user.id)),
  /** Adds or updates a SKU in the cart (quantity 0 removes it); validates stock, store assignment, and onboarding. */
  upsert: customerMutationProcedure
    .input(
      z.object({
        skuId: z.number(),
        productId: z.number().optional(),
        variantId: z.number().optional(),
        quantity: z.number().min(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const sku = await getSkuById(input.skuId);
      if (!sku)
        throw new TRPCError({ code: "NOT_FOUND", message: "SKU not found" });

      const user = await getUserById(ctx.user.id);
      if (!user?.onboardingComplete || !user?.assignedStoreId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: ONBOARDING_REQUIRED_MSG,
        });
      }
      if (sku.storeId !== user.assignedStoreId)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "SKU not available for your assigned store",
        });
      if (!sku.isActive)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "SKU is inactive",
        });
      if (input.productId && input.productId !== sku.productId)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Product mismatch for SKU",
        });
      if (input.quantity > 0) {
        const avail = await getCanonicalAvailabilityLedger(
          sku.productId,
          sku.storeId,
          sku.variantId ?? null
        );
        if (avail.totalSellable < input.quantity)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Requested quantity unavailable",
          });
      }
      await upsertCartItem(
        ctx.user.id,
        input.skuId,
        sku.productId,
        input.quantity
      );
      return { success: true };
    }),
  /** Removes all items from the cart, effectively abandoning the current session. */
  clear: customerMutationProcedure.mutation(async ({ ctx }) => {
    await clearCart(ctx.user.id);
    return { success: true };
  }),
});

// ─── Refill Reminders Router ──────────────────────────────────────────────────
const refillRouter = router({
  /** Returns all active refill reminders for the current user. */
  list: protectedProcedure.query(async ({ ctx }) =>
    getRefillReminders(ctx.user.id)
  ),
  /** Returns refill reminders that are currently due (alias of list). */
  due: protectedProcedure.query(async ({ ctx }) =>
    getRefillReminders(ctx.user.id)
  ),
  /** Permanently dismisses a refill reminder by ID. */
  dismiss: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await dismissRefillReminder(input.id, ctx.user.id);
      return { success: true };
    }),
  /** Marks a refill reminder as refilled and removes it from the active list. */
  markRefilled: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await dismissRefillReminder(input.id, ctx.user.id);
      return { success: true, status: "refilled" as const };
    }),
  /** Snooze a refill reminder for N days (1, 3, or 7) */
  snooze: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        days: z.union([z.literal(1), z.literal(3), z.literal(7)]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await snoozeRefillReminder(input.id, ctx.user.id, input.days);
      return { success: true };
    }),
  /** Initiates a draft reorder prompt from a refill reminder, with a compliance gate for regulated products. */
  createReorderPrompt: protectedProcedure
    .input(
      z.object({
        reminderId: z.number(),
        productId: z.number(),
        regulated: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.regulated) {
        await writeAuditLog(
          ctx.user.id,
          "refill.regulated_review_required",
          "refill",
          input.reminderId,
          undefined,
          { channel: "app", payload: { productId: input.productId } }
        );
      }
      return {
        promptId: `draft_prompt_${input.reminderId}_${Date.now()}`,
        reminderId: input.reminderId,
        productId: input.productId,
        complianceGateRequired: input.regulated,
        autoConfirmedSale: false,
        status: "draft_prompt",
        requiresPharmacistReview: input.regulated,
        persistence: "pending_table_mapping" as const,
      };
    }),
  /** Snoozed reminders — those with snoozedUntil > now */
  listSnoozed: protectedProcedure.query(async ({ ctx }) =>
    getSnoozedReminders(ctx.user.id)
  ),
});

const notificationRouter = router({
  /** Retrieves all notifications for the current user, most recent first. */
  list: protectedProcedure.query(async ({ ctx }) => ({
    rows: await getCustomerNotifications(ctx.user.id),
    persistence: "db_backed" as const,
  })),
  /** Returns the current user's notification channel preferences and sensitivity settings. */
  preferences: protectedProcedure.query(
    async ({ ctx }) => await getNotificationPreferences(ctx.user.id)
  ),
  /** Updates the current user's per-channel notification preferences and sensitive-content flag. */
  updatePreferences: protectedProcedure
    .input(
      z.object({
        allowSensitiveInUnsafeChannels: z.boolean().optional(),
        channels: z
          .record(
            z.enum(["in_app", "push", "email", "whatsapp", "sms"]),
            z.boolean()
          )
          .optional(),
      })
    )
    .mutation(
      async ({ ctx, input }) =>
        await updateNotificationPreferences(ctx.user.id, {
          allowSensitiveInUnsafeChannels: input.allowSensitiveInUnsafeChannels,
          channels: input.channels,
        })
    ),
  /** Sends a test notification to the current user on the specified channel; for QA and preference verification. */
  createTest: protectedProcedure
    .input(
      z.object({
        channel: z.enum(["in_app", "push", "email", "whatsapp", "sms"]),
        title: z.string(),
        body: z.string(),
        sensitive: z.boolean().default(false),
      })
    )
    .mutation(
      async ({ ctx, input }) =>
        await createNotification({
          customerId: ctx.user.id,
          channel: input.channel,
          title: input.title,
          body: input.body,
          sensitive: input.sensitive,
        })
    ),
});

const dosageRouter = router({
  createSchedule: protectedProcedure
    .input(
      z.object({
        productId: z.number(),
        unitsPerDay: z.number().positive(),
        totalUnits: z.number().positive(),
        source: z.enum(["prescription", "user", "pharmacist"]).default("user"),
      })
    )
    .mutation(
      async ({ ctx, input }) =>
        await createDosageSchedule({ customerId: ctx.user.id, ...input })
    ),
  todayPlan: protectedProcedure.query(
    async ({ ctx }) =>
      await getTodayDosePlan(ctx.user.id, new Date().toISOString().slice(0, 10))
  ),
  recordTaken: protectedProcedure
    .input(z.object({ scheduleId: z.string(), date: z.string() }))
    .mutation(async ({ ctx, input }) => ({
      ok: await recordDoseTaken(ctx.user.id, input.scheduleId, input.date),
    })),
  recordSkipped: protectedProcedure
    .input(z.object({ scheduleId: z.string(), date: z.string() }))
    .mutation(async ({ ctx, input }) => ({
      ok: await recordDoseSkipped(ctx.user.id, input.scheduleId, input.date),
    })),
  adherence: protectedProcedure
    .input(z.object({ scheduleId: z.string() }))
    .query(
      async ({ ctx, input }) =>
        await getAdherenceSummary(ctx.user.id, input.scheduleId)
    ),
  remaining: protectedProcedure
    .input(z.object({ scheduleId: z.string(), startDate: z.string() }))
    .query(async ({ ctx, input }) => ({
      remaining: await estimateMedicationRemaining(
        ctx.user.id,
        input.scheduleId
      ),
      runoutDate: await estimateRunoutDate(
        ctx.user.id,
        input.scheduleId,
        input.startDate
      ),
      persistence: "db_backed" as const,
    })),
});

// ─── Location Router ─────────────────────────────────────────────────────────
const locationRouter = router({
  /**
   * Places Autocomplete — returns address suggestions as user types.
   */
  autocomplete: publicProcedure
    .input(
      z.object({
        query: z.string().min(1).max(200),
        sessionToken: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      return getPlaceAutocomplete(input.query, input.sessionToken);
    }),

  /**
   * Geocode a place_id (from autocomplete) or a free-text address to lat/lng.
   */
  geocode: publicProcedure
    .input(
      z.object({
        placeId: z.string().optional(),
        address: z.string().optional(),
      })
    )
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
    .input(
      z.object({
        lat: z.number(),
        lng: z.number(),
        buildingPrimaryStoreId: z.number().optional(),
        pincode: z.string().optional(),
      })
    )
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
  request: protectedProcedure
    .input(
      z.object({
        chiefComplaint: z.string().min(5).max(1000),
        consultType: z.enum(["instant", "scheduled"]).default("instant"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const consult = await createConsultRequest(
        ctx.user.id,
        input.chiefComplaint,
        input.consultType
      );
      return consult;
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    return getConsultRequests(ctx.user.id);
  }),

  linkPrescription: protectedProcedure
    .input(
      z.object({
        consultId: z.number().int().positive(),
        prescriptionId: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await linkConsultPrescription(
        input.consultId,
        ctx.user.id,
        input.prescriptionId
      );
      return { ok: true };
    }),

  getRedirectUrl: publicProcedure.query(() => ({
    url: ENV.doctorConsultUrl,
    enabled: Boolean(ENV.doctorConsultUrl),
  })),
});

// ─── App Router ───────────────────────────────────────────────────────────────
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
  whatsapp: customerWhatsappRouter,
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
  accountingOps: accountingOpsRouter,
  complianceOps: complianceOpsRouter,
  reconciliation: reconciliationRouter,
  reports: reportsRouter,
  prescriptionGov: prescriptionGovRouter,
  customerMedicine: customerMedicineRouter,
  whatsappFull: whatsappFullRouter,
  delivery: deliveryRouter,
  commandCenter: commandCenterRouter,
  deploymentReadiness: deploymentReadinessRouter,
  multiStoreRuntime: multiStoreRuntimeRouter,
  deadLetters: deadLetterRouter,
  providerHealth: providerHealthRouter,
  onCall: onCallRouter,
  deployment: deploymentRouter,
  chaos: chaosRouter,
  restoreDrill: restoreDrillRouter,
  commandLog: commandLogRouter,
  outbox: outboxRouter,
  reservation: reservationRouter,
  availability: availabilityRouter,
  security: securityRouter,
  intelligence: intelligenceRouter,
  aiEval: aiEvalRouter,
  dsr: dsrRouter,
  dsrAdmin: dsrAdminRouter,
});

export type AppRouter = typeof appRouter;
