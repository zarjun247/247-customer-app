/**
 * server/routers/pharmacyRouter.ts
 * tRPC routers for Phases 4–9:
 *   - pharmacist: workbench queue, quick-verify, approve, reject, clearRxGate
 *   - inventory: FEFO alerts, stock queries, GRN receive
 *   - vendor: list, create, PO list, create PO
 *   - rider: list available, assign, verify OTP, record failed delivery
 *   - staff: list, assign, remove
 *   - metrics: daily sales, AOV, SLA, pharmacist queue latency, stockouts, expiry exposure
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  tplRxApproved,
  tplRxRejected,
  tplOutForDelivery,
  tplDelivered,
} from "../notifications";
import { sendCustomerNotification } from "../connectors";
import { getUserById } from "../db";
import {
  getRxQueue,
  quickVerifyRx,
  approveRx,
  rejectRx,
  manualReviewRx,
  clearRxGate,
  getFefoAlerts,
  getAvailableRiders,
  assignRider,
  verifyDeliveryOtp,
  recordFailedDelivery,
  getStaffForStore,
  assignStaff,
  removeStaff,
  getVendors,
  createVendor,
  getPurchaseOrders,
  createPurchaseOrder,
  receiveGrn,
  getDailySales,
  getAov,
  getSlaPerformance,
  getPharmacistQueueLatency,
  getStockouts,
  getExpiryExposure,
} from "../pharmacy";

// ─── RBAC helpers ─────────────────────────────────────────────────────────────

const PHARMACIST_ROLES = ["pharmacist", "admin"] as const;
const MANAGER_ROLES = ["store_manager", "admin"] as const;
const STAFF_ROLES = [
  "pharmacist",
  "store_manager",
  "inventory_operator",
  "delivery_operator",
  "auditor",
  "admin",
] as const;
const ADMIN_ROLES = ["admin"] as const;

function assertRole(
  userRole: string,
  allowed: readonly string[],
  label: string
) {
  if (!allowed.includes(userRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `${label} access required`,
    });
  }
}

function getStoreId(user: {
  staffStoreId?: number | null;
  role: string;
}): number {
  if (user.staffStoreId) return user.staffStoreId;
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "No store assigned to this staff member",
  });
}

// ─── Pharmacist Workbench Router ──────────────────────────────────────────────

export const pharmacistRouter = router({
  /** Get the Rx review queue for the pharmacist's assigned store */
  queue: protectedProcedure.query(async ({ ctx }) => {
    assertRole(ctx.user.role, PHARMACIST_ROLES, "Pharmacist");
    const storeId = getStoreId(ctx.user);
    return getRxQueue(storeId);
  }),

  /** Quick-verify: approve without full review (low-risk OTC-adjacent Rx) */
  quickVerify: protectedProcedure
    .input(z.object({ rxId: z.number().int(), note: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      assertRole(ctx.user.role, PHARMACIST_ROLES, "Pharmacist");
      return quickVerifyRx(input.rxId, ctx.user.id, input.note);
    }),

  /** Full approval after manual review */
  approve: protectedProcedure
    .input(z.object({ rxId: z.number().int(), note: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      assertRole(ctx.user.role, PHARMACIST_ROLES, "Pharmacist");
      const result = await approveRx(input.rxId, ctx.user.id, input.note);
      // Fire-and-forget: notify customer via SMS
      const payload = tplRxApproved({
        customerName: "Customer",
        prescriptionId: input.rxId,
        pharmacistName: ctx.user.name ?? undefined,
      });
      // Look up order to get customer phone
      try {
        const { getDb } = await import("../db");
        const { prescriptions } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const db = await getDb();
        if (db) {
          const rx = await db
            .select({ userId: prescriptions.userId })
            .from(prescriptions)
            .where(eq(prescriptions.id, input.rxId))
            .limit(1);
          if (rx[0]) {
            const user = await getUserById(rx[0].userId);
            if (user?.phone)
              await sendCustomerNotification(user.phone, payload);
          }
        }
      } catch (e) {
        console.error("[SMS] approve notification failed:", e);
      }
      return result;
    }),

  /** Reject prescription with mandatory note */
  reject: protectedProcedure
    .input(z.object({ rxId: z.number().int(), note: z.string().min(5) }))
    .mutation(async ({ ctx, input }) => {
      assertRole(ctx.user.role, PHARMACIST_ROLES, "Pharmacist");
      const result = await rejectRx(input.rxId, ctx.user.id, input.note);
      // Fire-and-forget: notify customer via SMS
      const payload = tplRxRejected({
        customerName: "Customer",
        prescriptionId: input.rxId,
        reason: input.note,
      });
      try {
        const { getDb } = await import("../db");
        const { prescriptions } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const db = await getDb();
        if (db) {
          const rx = await db
            .select({ userId: prescriptions.userId })
            .from(prescriptions)
            .where(eq(prescriptions.id, input.rxId))
            .limit(1);
          if (rx[0]) {
            const user = await getUserById(rx[0].userId);
            if (user?.phone)
              await sendCustomerNotification(user.phone, payload);
          }
        }
      } catch (e) {
        console.error("[SMS] reject notification failed:", e);
      }
      return result;
    }),

  /** Send to manual review (additional_verification) */
  sendToManualReview: protectedProcedure
    .input(z.object({ rxId: z.number().int(), note: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      assertRole(ctx.user.role, PHARMACIST_ROLES, "Pharmacist");
      return manualReviewRx(input.rxId, ctx.user.id, input.note);
    }),

  /** Clear the Rx gate for an order — moves order to 'picking' */
  clearGate: protectedProcedure
    .input(z.object({ orderId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      assertRole(ctx.user.role, PHARMACIST_ROLES, "Pharmacist");
      return clearRxGate(input.orderId, ctx.user.id);
    }),
  /** Admin: list all orders with optional status filter */
  adminListOrders: protectedProcedure
    .input(
      z.object({
        status: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(200),
      })
    )
    .query(async ({ ctx, input }) => {
      assertRole(ctx.user.role, STAFF_ROLES, "Staff");
      const { getAllOrders } = await import("../db");
      return getAllOrders({ status: input.status, limit: input.limit });
    }),
});

// ─── Inventory Router ─────────────────────────────────────────────────────────

export const inventoryRouter = router({
  /** FEFO alerts: batches expiring within 90 days */
  fefoAlerts: protectedProcedure.query(async ({ ctx }) => {
    assertRole(ctx.user.role, STAFF_ROLES, "Staff");
    const storeId = getStoreId(ctx.user);
    return getFefoAlerts(storeId);
  }),

  /** Stockouts: SKUs with zero stock */
  stockouts: protectedProcedure.query(async ({ ctx }) => {
    assertRole(ctx.user.role, STAFF_ROLES, "Staff");
    const storeId = getStoreId(ctx.user);
    return getStockouts(storeId);
  }),

  /** Receive a GRN (Goods Received Note) — updates batches and stock quantities */
  receiveGrn: protectedProcedure
    .input(
      z.object({
        poId: z.number().int().optional(),
        notes: z.string().optional(),
        items: z.array(
          z.object({
            productId: z.number().int(),
            variantId: z.number().int().optional(),
            batchNumber: z.string().min(1),
            expiryDate: z.date(),
            quantity: z.number().int().positive(),
            unitCost: z.number().positive().optional(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertRole(
        ctx.user.role,
        ["inventory_operator", "store_manager", "admin"],
        "Inventory operator"
      );
      const storeId = getStoreId(ctx.user);
      return receiveGrn({ ...input, storeId, receivedByUserId: ctx.user.id });
    }),
});

// ─── Vendor / PO Router ───────────────────────────────────────────────────────

export const vendorRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    assertRole(ctx.user.role, STAFF_ROLES, "Staff");
    return getVendors();
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        contactName: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        gstin: z.string().optional(),
        address: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertRole(ctx.user.role, MANAGER_ROLES, "Store manager");
      return createVendor(input);
    }),

  listPOs: protectedProcedure.query(async ({ ctx }) => {
    assertRole(ctx.user.role, STAFF_ROLES, "Staff");
    const storeId = getStoreId(ctx.user);
    return getPurchaseOrders(storeId);
  }),

  createPO: protectedProcedure
    .input(
      z.object({
        vendorId: z.number().int(),
        expectedDelivery: z.date().optional(),
        notes: z.string().optional(),
        items: z.array(
          z.object({
            productId: z.number().int(),
            variantId: z.number().int().optional(),
            orderedQty: z.number().int().positive(),
            unitCost: z.number().positive(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertRole(ctx.user.role, MANAGER_ROLES, "Store manager");
      const storeId = getStoreId(ctx.user);
      return createPurchaseOrder({
        ...input,
        storeId,
        createdByUserId: ctx.user.id,
      });
    }),
});

// ─── Staff Router ─────────────────────────────────────────────────────────────

export const staffRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    assertRole(ctx.user.role, MANAGER_ROLES, "Store manager");
    const storeId = getStoreId(ctx.user);
    return getStaffForStore(storeId);
  }),

  assign: protectedProcedure
    .input(
      z.object({
        userId: z.number().int(),
        role: z.enum([
          "pharmacist",
          "store_manager",
          "inventory_operator",
          "delivery_operator",
          "auditor",
        ]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertRole(ctx.user.role, ADMIN_ROLES, "Admin");
      const storeId = getStoreId(ctx.user);
      return assignStaff({ ...input, storeId, assignedByUserId: ctx.user.id });
    }),

  remove: protectedProcedure
    .input(z.object({ assignmentId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      assertRole(ctx.user.role, ADMIN_ROLES, "Admin");
      return removeStaff(input.assignmentId);
    }),
});

// ─── Rider Router ─────────────────────────────────────────────────────────────

export const riderRouter = router({
  available: protectedProcedure.query(async ({ ctx }) => {
    assertRole(
      ctx.user.role,
      ["delivery_operator", "store_manager", "admin"],
      "Delivery operator"
    );
    const storeId = getStoreId(ctx.user);
    return getAvailableRiders(storeId);
  }),

  assign: protectedProcedure
    .input(z.object({ orderId: z.number().int(), riderId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      assertRole(
        ctx.user.role,
        ["delivery_operator", "store_manager", "admin"],
        "Delivery operator"
      );
      const result = await assignRider(
        input.orderId,
        input.riderId,
        ctx.user.id
      );
      // Fire-and-forget: notify customer via SMS
      const payload = tplOutForDelivery({
        orderId: input.orderId,
        customerName: "Customer",
        riderName: "Rider",
      });
      try {
        const { getDb } = await import("../db");
        const { orders } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const db = await getDb();
        if (db) {
          const order = await db
            .select({ userId: orders.userId })
            .from(orders)
            .where(eq(orders.id, input.orderId))
            .limit(1);
          if (order[0]) {
            const user = await getUserById(order[0].userId);
            if (user?.phone)
              await sendCustomerNotification(user.phone, payload);
          }
        }
      } catch (e) {
        console.error("[SMS] out-for-delivery notification failed:", e);
      }
      return result;
    }),

  verifyOtp: protectedProcedure
    .input(z.object({ orderId: z.number().int(), otp: z.string().length(6) }))
    .mutation(async ({ ctx, input }) => {
      assertRole(
        ctx.user.role,
        ["delivery_operator", "store_manager", "admin"],
        "Delivery operator"
      );
      const result = await verifyDeliveryOtp(input.orderId, input.otp);
      // Fire-and-forget: notify customer via SMS + close SLA event
      const payload = tplDelivered({
        orderId: input.orderId,
        customerName: "Customer",
      });
      try {
        const { getDb } = await import("../db");
        const { orders } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const { closeSlaEvent } = await import("../payment");
        const db = await getDb();
        if (db) {
          const order = await db
            .select({ userId: orders.userId })
            .from(orders)
            .where(eq(orders.id, input.orderId))
            .limit(1);
          if (order[0]) {
            const user = await getUserById(order[0].userId);
            if (user?.phone)
              await sendCustomerNotification(user.phone, payload);
          }
        }
        await closeSlaEvent(input.orderId);
      } catch (e) {
        console.error("[SMS] delivered notification failed:", e);
      }
      return result;
    }),

  recordFailed: protectedProcedure
    .input(
      z.object({
        orderId: z.number().int(),
        riderId: z.number().int(),
        note: z.string().min(5),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertRole(
        ctx.user.role,
        ["delivery_operator", "store_manager", "admin"],
        "Delivery operator"
      );
      return recordFailedDelivery(input.orderId, input.riderId, input.note);
    }),
});

// ─── Metrics Router ───────────────────────────────────────────────────────────

export const metricsRouter = router({
  dailySales: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      assertRole(ctx.user.role, MANAGER_ROLES, "Store manager");
      const storeId = getStoreId(ctx.user);
      return getDailySales(storeId, input.days);
    }),

  aov: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      assertRole(ctx.user.role, MANAGER_ROLES, "Store manager");
      const storeId = getStoreId(ctx.user);
      return getAov(storeId, input.days);
    }),

  sla: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      assertRole(ctx.user.role, MANAGER_ROLES, "Store manager");
      const storeId = getStoreId(ctx.user);
      return getSlaPerformance(storeId, input.days);
    }),

  pharmacistQueue: protectedProcedure.query(async ({ ctx }) => {
    assertRole(ctx.user.role, MANAGER_ROLES, "Store manager");
    const storeId = getStoreId(ctx.user);
    return getPharmacistQueueLatency(storeId);
  }),

  stockouts: protectedProcedure.query(async ({ ctx }) => {
    assertRole(ctx.user.role, MANAGER_ROLES, "Store manager");
    const storeId = getStoreId(ctx.user);
    return getStockouts(storeId);
  }),

  expiryExposure: protectedProcedure.query(async ({ ctx }) => {
    assertRole(ctx.user.role, MANAGER_ROLES, "Store manager");
    const storeId = getStoreId(ctx.user);
    return getExpiryExposure(storeId);
  }),

  /** Combined dashboard snapshot — all metrics in one call */
  dashboard: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      assertRole(ctx.user.role, MANAGER_ROLES, "Store manager");
      const storeId = getStoreId(ctx.user);
      const [sales, aov, sla, queue, stockouts, expiry] = await Promise.all([
        getDailySales(storeId, input.days),
        getAov(storeId, input.days),
        getSlaPerformance(storeId, input.days),
        getPharmacistQueueLatency(storeId),
        getStockouts(storeId),
        getExpiryExposure(storeId),
      ]);
      return { sales, aov, sla, queue, stockouts, expiry };
    }),
});
