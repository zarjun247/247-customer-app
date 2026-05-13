/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */
import { z } from "zod";
import {
  router,
  protectedProcedure,
  publicProcedure as _publicProcedure,
} from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  eq,
  and,
  desc,
  sql,
  like as _like,
  or as _or,
  asc,
  gte,
  lte,
  isNull as _isNull,
} from "drizzle-orm";
import { customerMedicineRouterExtension } from "./customerMedicineRouterExtension";

async function getDbSafe() {
  const { getDb } = await import("../db");
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "DB unavailable",
    });
  return db;
}

async function logAccess(
  db: Awaited<ReturnType<typeof getDbSafe>>,
  targetUserId: number,
  accessedBy: number,
  accessType: "view" | "export" | "admin_view" | "api_check",
  purpose?: string,
  ipAddress?: string
) {
  const { medicineRecordAccessLog } = await import("../../drizzle/schema");
  await db.insert(medicineRecordAccessLog).values({
    targetUserId,
    accessedBy,
    accessType,
    purpose: purpose ?? null,
    ipAddress: ipAddress ?? null,
  });
}

// ─── Family Members ──────────────────────────────────────────────────────────

const familyMemberRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDbSafe();
    const { familyMembers } = await import("../../drizzle/schema");
    const rows = await db
      .select()
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.userId, ctx.user.id),
          eq(familyMembers.active, true)
        )
      )
      .orderBy(asc(familyMembers.name));
    return { rows };
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        relation: z.string().optional(),
        dateOfBirth: z.string().optional(),
        gender: z.enum(["male", "female", "other"]).optional(),
        phone: z.string().optional(),
        patientCategoryId: z.number().optional(),
        chronicConditions: z.array(z.string()).optional(),
        allergies: z.array(z.string()).optional(),
        bloodGroup: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDbSafe();
      const { familyMembers } = await import("../../drizzle/schema");
      const [result] = await db.insert(familyMembers).values({
        userId: ctx.user.id,
        name: input.name,
        relation: input.relation ?? null,
        dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
        gender: input.gender ?? null,
        phone: input.phone ?? null,
        patientCategoryId: input.patientCategoryId ?? null,
        chronicConditions: input.chronicConditions
          ? JSON.stringify(input.chronicConditions)
          : null,
        allergies: input.allergies ? JSON.stringify(input.allergies) : null,
        bloodGroup: input.bloodGroup ?? null,
      });
      return { id: (result as any).insertId };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(200).optional(),
        relation: z.string().optional(),
        dateOfBirth: z.string().optional(),
        gender: z.enum(["male", "female", "other"]).optional(),
        phone: z.string().optional(),
        patientCategoryId: z.number().optional(),
        chronicConditions: z.array(z.string()).optional(),
        allergies: z.array(z.string()).optional(),
        bloodGroup: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDbSafe();
      const { familyMembers } = await import("../../drizzle/schema");
      const { id, ...fields } = input;
      const updateData: Record<string, unknown> = {};
      if (fields.name !== undefined) updateData.name = fields.name;
      if (fields.relation !== undefined) updateData.relation = fields.relation;
      if (fields.dateOfBirth !== undefined)
        updateData.dateOfBirth = new Date(fields.dateOfBirth);
      if (fields.gender !== undefined) updateData.gender = fields.gender;
      if (fields.phone !== undefined) updateData.phone = fields.phone;
      if (fields.patientCategoryId !== undefined)
        updateData.patientCategoryId = fields.patientCategoryId;
      if (fields.chronicConditions !== undefined)
        updateData.chronicConditions = JSON.stringify(fields.chronicConditions);
      if (fields.allergies !== undefined)
        updateData.allergies = JSON.stringify(fields.allergies);
      if (fields.bloodGroup !== undefined)
        updateData.bloodGroup = fields.bloodGroup;
      await db
        .update(familyMembers)
        .set(updateData)
        .where(
          and(eq(familyMembers.id, id), eq(familyMembers.userId, ctx.user.id))
        );
      return { ok: true };
    }),

  deactivate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDbSafe();
      const { familyMembers } = await import("../../drizzle/schema");
      await db
        .update(familyMembers)
        .set({ active: false })
        .where(
          and(
            eq(familyMembers.id, input.id),
            eq(familyMembers.userId, ctx.user.id)
          )
        );
      return { ok: true };
    }),
});

// ─── Medicine Records ─────────────────────────────────────────────────────────

const medicineRecordRouter = router({
  /** Get full medicine history for a user (self or admin view) */
  list: protectedProcedure
    .input(
      z.object({
        targetUserId: z.number().optional(), // admin: view another user; omit = self
        familyMemberId: z.number().optional(),
        discontinued: z.boolean().optional(),
        isChronicFlag: z.boolean().optional(),
        search: z.string().optional(),
        page: z.number().default(1),
        limit: z.number().default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDbSafe();
      const {
        customerMedicineRecords,
        products,
        medicineRecordAccessLog: _medicineRecordAccessLog,
      } = await import("../../drizzle/schema");

      const userId = input.targetUserId ?? ctx.user.id;
      // Admin access log
      if (input.targetUserId && input.targetUserId !== ctx.user.id) {
        await logAccess(
          db,
          userId,
          ctx.user.id,
          "admin_view",
          "admin customer medicine history"
        );
      }

      const conditions = [eq(customerMedicineRecords.userId, userId)];
      if (input.familyMemberId !== undefined) {
        conditions.push(
          eq(customerMedicineRecords.familyMemberId, input.familyMemberId)
        );
      }
      if (input.discontinued !== undefined) {
        conditions.push(
          eq(customerMedicineRecords.discontinued, input.discontinued)
        );
      }
      if (input.isChronicFlag !== undefined) {
        conditions.push(
          eq(customerMedicineRecords.isChronicFlag, input.isChronicFlag)
        );
      }

      const offset = (input.page - 1) * input.limit;
      const rows = await db
        .select({
          id: customerMedicineRecords.id,
          userId: customerMedicineRecords.userId,
          familyMemberId: customerMedicineRecords.familyMemberId,
          productId: customerMedicineRecords.productId,
          productName: products.name,
          purchaseType: customerMedicineRecords.purchaseType,
          qty: customerMedicineRecords.qty,
          purchaseDate: customerMedicineRecords.purchaseDate,
          doctorName: customerMedicineRecords.doctorName,
          isNewMedicine: customerMedicineRecords.isNewMedicine,
          isChronicFlag: customerMedicineRecords.isChronicFlag,
          discontinued: customerMedicineRecords.discontinued,
          discontinuedReason: customerMedicineRecords.discontinuedReason,
          pharmacistNote: customerMedicineRecords.pharmacistNote,
        })
        .from(customerMedicineRecords)
        .leftJoin(products, eq(customerMedicineRecords.productId, products.id))
        .where(and(...conditions))
        .orderBy(desc(customerMedicineRecords.purchaseDate))
        .limit(input.limit)
        .offset(offset);

      const [{ total }] = await db
        .select({ total: sql<number>`count(*)` })
        .from(customerMedicineRecords)
        .where(and(...conditions));

      return { rows, total, page: input.page, limit: input.limit };
    }),

  /** Create a medicine record (called after sale/order commit) */
  create: protectedProcedure
    .input(
      z.object({
        userId: z.number(),
        familyMemberId: z.number().optional(),
        productId: z.number(),
        batchId: z.number().optional(),
        orderId: z.number().optional(),
        saleId: z.number().optional(),
        prescriptionId: z.number().optional(),
        purchaseType: z
          .enum(["prescribed", "otc", "chronic_refill", "counter", "whatsapp"])
          .default("otc"),
        qty: z.number().min(1),
        purchaseDate: z.string(),
        doctorName: z.string().optional(),
        doctorReg: z.string().optional(),
        isNewMedicine: z.boolean().default(false),
        isChronicFlag: z.boolean().default(false),
        pharmacistNote: z.string().optional(),
      })
    )
    .mutation(async ({ ctx: _ctx, input }) => {
      const db = await getDbSafe();
      const { customerMedicineRecords } = await import("../../drizzle/schema");
      const [result] = await db.insert(customerMedicineRecords).values({
        userId: input.userId,
        familyMemberId: input.familyMemberId ?? null,
        productId: input.productId,
        batchId: input.batchId ?? null,
        orderId: input.orderId ?? null,
        saleId: input.saleId ?? null,
        prescriptionId: input.prescriptionId ?? null,
        purchaseType: input.purchaseType,
        qty: input.qty,
        purchaseDate: new Date(input.purchaseDate),
        doctorName: input.doctorName ?? null,
        doctorReg: input.doctorReg ?? null,
        isNewMedicine: input.isNewMedicine,
        isChronicFlag: input.isChronicFlag,
        discontinued: false,
        pharmacistNote: input.pharmacistNote ?? null,
      });
      return { id: (result as any).insertId };
    }),

  /** Mark a medicine as discontinued */
  discontinue: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx: _ctx, input }) => {
      const db = await getDbSafe();
      const { customerMedicineRecords } = await import("../../drizzle/schema");
      await db
        .update(customerMedicineRecords)
        .set({
          discontinued: true,
          discontinuedReason: input.reason ?? null,
          discontinuedAt: new Date(),
        })
        .where(eq(customerMedicineRecords.id, input.id));
      return { ok: true };
    }),

  /** Check if customer has bought this product before */
  hasBoughtBefore: protectedProcedure
    .input(z.object({ productId: z.number(), userId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDbSafe();
      const { customerMedicineRecords } = await import("../../drizzle/schema");
      const userId = input.userId ?? ctx.user.id;
      const [row] = await db
        .select({ id: customerMedicineRecords.id })
        .from(customerMedicineRecords)
        .where(
          and(
            eq(customerMedicineRecords.userId, userId),
            eq(customerMedicineRecords.productId, input.productId)
          )
        )
        .limit(1);
      return { hasBought: !!row };
    }),
});

// ─── Refill Plans ─────────────────────────────────────────────────────────────

const refillPlanRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        userId: z.number().optional(),
        status: z
          .enum(["active", "paused", "completed", "cancelled"])
          .optional(),
        dueSoon: z.boolean().optional(), // due within 7 days
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDbSafe();
      const {
        refillPlans,
        products,
        familyMembers: _familyMembers,
      } = await import("../../drizzle/schema");

      const userId = input.userId ?? ctx.user.id;
      const conditions = [eq(refillPlans.userId, userId)];
      if (input.status) conditions.push(eq(refillPlans.status, input.status));
      if (input.dueSoon) {
        const sevenDaysFromNow = new Date();
        sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
        conditions.push(lte(refillPlans.nextDueDate, sevenDaysFromNow));
        conditions.push(eq(refillPlans.status, "active"));
      }

      const rows = await db
        .select({
          id: refillPlans.id,
          userId: refillPlans.userId,
          familyMemberId: refillPlans.familyMemberId,
          productId: refillPlans.productId,
          productName: products.name,
          frequencyDays: refillPlans.frequencyDays,
          qty: refillPlans.qty,
          nextDueDate: refillPlans.nextDueDate,
          lastFulfilledDate: refillPlans.lastFulfilledDate,
          status: refillPlans.status,
          needsFreshRx: refillPlans.needsFreshRx,
          prescriptionExpiryDate: refillPlans.prescriptionExpiryDate,
          whatsappReminder: refillPlans.whatsappReminder,
          appReminder: refillPlans.appReminder,
        })
        .from(refillPlans)
        .leftJoin(products, eq(refillPlans.productId, products.id))
        .where(and(...conditions))
        .orderBy(asc(refillPlans.nextDueDate));

      return { rows };
    }),

  create: protectedProcedure
    .input(
      z.object({
        userId: z.number().optional(),
        familyMemberId: z.number().optional(),
        productId: z.number(),
        prescriptionId: z.number().optional(),
        frequencyDays: z.number().min(1).max(365),
        qty: z.number().min(1),
        startDate: z.string(),
        endDate: z.string().optional(),
        reminderDaysBefore: z.number().default(3),
        whatsappReminder: z.boolean().default(true),
        appReminder: z.boolean().default(true),
        prescriptionExpiryDate: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDbSafe();
      const { refillPlans } = await import("../../drizzle/schema");
      const userId = input.userId ?? ctx.user.id;
      const startDate = new Date(input.startDate);
      const nextDueDate = new Date(startDate);
      nextDueDate.setDate(nextDueDate.getDate() + input.frequencyDays);

      const [result] = await db.insert(refillPlans).values({
        userId,
        familyMemberId: input.familyMemberId ?? null,
        productId: input.productId,
        prescriptionId: input.prescriptionId ?? null,
        frequencyDays: input.frequencyDays,
        qty: input.qty,
        startDate,
        endDate: input.endDate ? new Date(input.endDate) : null,
        nextDueDate,
        status: "active",
        reminderDaysBefore: input.reminderDaysBefore,
        whatsappReminder: input.whatsappReminder,
        appReminder: input.appReminder,
        prescriptionExpiryDate: input.prescriptionExpiryDate
          ? new Date(input.prescriptionExpiryDate)
          : null,
        createdBy: ctx.user.id,
      });
      return { id: (result as any).insertId };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        status: z
          .enum(["active", "paused", "completed", "cancelled"])
          .optional(),
        frequencyDays: z.number().optional(),
        qty: z.number().optional(),
        nextDueDate: z.string().optional(),
        needsFreshRx: z.boolean().optional(),
        prescriptionExpiryDate: z.string().optional(),
        whatsappReminder: z.boolean().optional(),
        appReminder: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx: _ctx, input }) => {
      const db = await getDbSafe();
      const { refillPlans, refillEvents } = await import(
        "../../drizzle/schema"
      );
      const { id, ...fields } = input;
      const updateData: Record<string, unknown> = {};
      if (fields.status !== undefined) updateData.status = fields.status;
      if (fields.frequencyDays !== undefined)
        updateData.frequencyDays = fields.frequencyDays;
      if (fields.qty !== undefined) updateData.qty = fields.qty;
      if (fields.nextDueDate !== undefined)
        updateData.nextDueDate = new Date(fields.nextDueDate);
      if (fields.needsFreshRx !== undefined)
        updateData.needsFreshRx = fields.needsFreshRx;
      if (fields.prescriptionExpiryDate !== undefined)
        updateData.prescriptionExpiryDate = new Date(
          fields.prescriptionExpiryDate
        );
      if (fields.whatsappReminder !== undefined)
        updateData.whatsappReminder = fields.whatsappReminder;
      if (fields.appReminder !== undefined)
        updateData.appReminder = fields.appReminder;

      await db
        .update(refillPlans)
        .set(updateData)
        .where(eq(refillPlans.id, id));

      // Log plan_paused / plan_resumed events
      if (fields.status === "paused" || fields.status === "active") {
        const [plan] = await db
          .select()
          .from(refillPlans)
          .where(eq(refillPlans.id, id))
          .limit(1);
        if (plan) {
          await db.insert(refillEvents).values({
            refillPlanId: id,
            userId: plan.userId,
            eventType:
              fields.status === "paused" ? "plan_paused" : "plan_resumed",
            dueDate: plan.nextDueDate,
          });
        }
      }
      return { ok: true };
    }),

  /** Mark a refill as fulfilled (called after order/sale commit) */
  markFulfilled: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        orderId: z.number().optional(),
        saleId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx: _ctx, input }) => {
      const db = await getDbSafe();
      const { refillPlans, refillEvents } = await import(
        "../../drizzle/schema"
      );
      const [plan] = await db
        .select()
        .from(refillPlans)
        .where(eq(refillPlans.id, input.id))
        .limit(1);
      if (!plan)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Refill plan not found",
        });

      const today = new Date();
      const nextDue = new Date(today);
      nextDue.setDate(nextDue.getDate() + plan.frequencyDays);

      await db
        .update(refillPlans)
        .set({
          lastFulfilledDate: today,
          nextDueDate: nextDue,
        })
        .where(eq(refillPlans.id, input.id));

      await db.insert(refillEvents).values({
        refillPlanId: input.id,
        userId: plan.userId,
        eventType: "refill_ordered",
        dueDate: plan.nextDueDate,
        orderId: input.orderId ?? null,
        saleId: input.saleId ?? null,
      });

      return { ok: true, nextDueDate: nextDue };
    }),

  /** Get refill events for a plan */
  events: protectedProcedure
    .input(z.object({ refillPlanId: z.number() }))
    .query(async ({ ctx: _ctx, input }) => {
      const db = await getDbSafe();
      const { refillEvents } = await import("../../drizzle/schema");
      const rows = await db
        .select()
        .from(refillEvents)
        .where(eq(refillEvents.refillPlanId, input.refillPlanId))
        .orderBy(desc(refillEvents.createdAt));
      return { rows };
    }),

  /** Dashboard: refills due this week + missed refills */
  dashboard: protectedProcedure
    .input(z.object({ userId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDbSafe();
      const { refillPlans, products } = await import("../../drizzle/schema");
      const userId = input.userId ?? ctx.user.id;

      const today = new Date();
      const sevenDaysFromNow = new Date(today);
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

      // Due this week
      const dueThisWeek = await db
        .select({
          id: refillPlans.id,
          productId: refillPlans.productId,
          productName: products.name,
          nextDueDate: refillPlans.nextDueDate,
          qty: refillPlans.qty,
          needsFreshRx: refillPlans.needsFreshRx,
          prescriptionExpiryDate: refillPlans.prescriptionExpiryDate,
        })
        .from(refillPlans)
        .leftJoin(products, eq(refillPlans.productId, products.id))
        .where(
          and(
            eq(refillPlans.userId, userId),
            eq(refillPlans.status, "active"),
            lte(refillPlans.nextDueDate, sevenDaysFromNow),
            gte(refillPlans.nextDueDate, today)
          )
        )
        .orderBy(asc(refillPlans.nextDueDate));

      // Missed (overdue)
      const missed = await db
        .select({
          id: refillPlans.id,
          productId: refillPlans.productId,
          productName: products.name,
          nextDueDate: refillPlans.nextDueDate,
          qty: refillPlans.qty,
        })
        .from(refillPlans)
        .leftJoin(products, eq(refillPlans.productId, products.id))
        .where(
          and(
            eq(refillPlans.userId, userId),
            eq(refillPlans.status, "active"),
            lte(refillPlans.nextDueDate, today)
          )
        )
        .orderBy(asc(refillPlans.nextDueDate));

      return { dueThisWeek, missed };
    }),
});

// ─── Compose Router ───────────────────────────────────────────────────────────

export const customerMedicineRouter = router({
  family: familyMemberRouter,
  medicineRecord: medicineRecordRouter,
  refillPlan: refillPlanRouter,
  ...customerMedicineRouterExtension,
});
