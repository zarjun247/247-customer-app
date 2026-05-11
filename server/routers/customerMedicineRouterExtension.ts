/**
 * customerMedicineRouterExtension.ts — second half of customerMedicineRouter
 * Covers: consentRouter, adminCustomerRouter
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, sql, like, or, asc, gte, lte } from "drizzle-orm";

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

// ─── Consents ─────────────────────────────────────────────────────────────────

const consentRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDbSafe();
    const { customerConsents } = await import("../../drizzle/schema");
    const rows = await db
      .select()
      .from(customerConsents)
      .where(eq(customerConsents.userId, ctx.user.id))
      .orderBy(desc(customerConsents.grantedAt));
    return { rows };
  }),

  upsert: protectedProcedure
    .input(
      z.object({
        consentType: z.enum([
          "medicine_record_storage",
          "family_profile",
          "refill_reminder_whatsapp",
          "refill_reminder_app",
          "refill_reminder_sms",
          "prescription_data_processing",
          "chronic_condition_tracking",
          "marketing_communications",
          "data_sharing_doctor",
        ]),
        granted: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDbSafe();
      const { customerConsents } = await import("../../drizzle/schema");
      // Check if exists
      const [existing] = await db
        .select()
        .from(customerConsents)
        .where(
          and(
            eq(customerConsents.userId, ctx.user.id),
            eq(customerConsents.consentType, input.consentType)
          )
        )
        .limit(1);

      if (existing) {
        await db
          .update(customerConsents)
          .set({
            granted: input.granted,
            revokedAt: input.granted ? null : new Date(),
          })
          .where(eq(customerConsents.id, existing.id));
      } else {
        await db.insert(customerConsents).values({
          userId: ctx.user.id,
          consentType: input.consentType,
          granted: input.granted,
        });
      }
      return { ok: true };
    }),
});

// ─── Admin Customer List ──────────────────────────────────────────────────────

const adminCustomerRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        patientCategoryId: z.number().optional(),
        isChronicOnly: z.boolean().optional(),
        page: z.number().default(1),
        limit: z.number().default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDbSafe();
      const { users, customerMedicineRecords } = await import(
        "../../drizzle/schema"
      );

      const conditions = [];
      if (input.search) {
        conditions.push(
          or(
            like(users.name, `%${input.search}%`),
            like(users.phone, `%${input.search}%`)
          )
        );
      }

      const offset = (input.page - 1) * input.limit;
      const rows = await db
        .select({
          id: users.id,
          name: users.name,
          phone: users.phone,
          email: users.email,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(users.createdAt))
        .limit(input.limit)
        .offset(offset);

      const [{ total }] = await db
        .select({ total: sql<number>`count(*)` })
        .from(users)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      return { rows, total, page: input.page, limit: input.limit };
    }),

  /** Get full customer profile: medicine history + refill plans + consents */
  getProfile: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDbSafe();
      const {
        users,
        customerMedicineRecords,
        refillPlans,
        familyMembers,
        customerConsents,
        products,
      } = await import("../../drizzle/schema");

      // Log admin access
      await logAccess(
        db,
        input.userId,
        ctx.user.id,
        "admin_view",
        "admin customer profile view"
      );

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      if (!user)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Customer not found",
        });

      const medicineHistory = await db
        .select({
          id: customerMedicineRecords.id,
          productId: customerMedicineRecords.productId,
          productName: products.name,
          purchaseType: customerMedicineRecords.purchaseType,
          qty: customerMedicineRecords.qty,
          purchaseDate: customerMedicineRecords.purchaseDate,
          isChronicFlag: customerMedicineRecords.isChronicFlag,
          discontinued: customerMedicineRecords.discontinued,
          familyMemberId: customerMedicineRecords.familyMemberId,
        })
        .from(customerMedicineRecords)
        .leftJoin(products, eq(customerMedicineRecords.productId, products.id))
        .where(eq(customerMedicineRecords.userId, input.userId))
        .orderBy(desc(customerMedicineRecords.purchaseDate))
        .limit(50);

      const activePlans = await db
        .select({
          id: refillPlans.id,
          productId: refillPlans.productId,
          productName: products.name,
          frequencyDays: refillPlans.frequencyDays,
          nextDueDate: refillPlans.nextDueDate,
          status: refillPlans.status,
          needsFreshRx: refillPlans.needsFreshRx,
          qty: refillPlans.qty,
        })
        .from(refillPlans)
        .leftJoin(products, eq(refillPlans.productId, products.id))
        .where(
          and(
            eq(refillPlans.userId, input.userId),
            eq(refillPlans.status, "active")
          )
        )
        .orderBy(asc(refillPlans.nextDueDate));

      const family = await db
        .select()
        .from(familyMembers)
        .where(
          and(
            eq(familyMembers.userId, input.userId),
            eq(familyMembers.active, true)
          )
        );

      const consents = await db
        .select()
        .from(customerConsents)
        .where(eq(customerConsents.userId, input.userId));

      return { user, medicineHistory, activePlans, family, consents };
    }),

  /** Access log for a customer's medicine records */
  accessLog: protectedProcedure
    .input(
      z.object({
        targetUserId: z.number(),
        page: z.number().default(1),
        limit: z.number().default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDbSafe();
      const { medicineRecordAccessLog, users } = await import(
        "../../drizzle/schema"
      );
      const offset = (input.page - 1) * input.limit;
      const rows = await db
        .select({
          id: medicineRecordAccessLog.id,
          accessedBy: medicineRecordAccessLog.accessedBy,
          accessorName: users.name,
          accessType: medicineRecordAccessLog.accessType,
          purpose: medicineRecordAccessLog.purpose,
          createdAt: medicineRecordAccessLog.createdAt,
        })
        .from(medicineRecordAccessLog)
        .leftJoin(users, eq(medicineRecordAccessLog.accessedBy, users.id))
        .where(eq(medicineRecordAccessLog.targetUserId, input.targetUserId))
        .orderBy(desc(medicineRecordAccessLog.createdAt))
        .limit(input.limit)
        .offset(offset);
      return { rows };
    }),

  /** Refill dashboard: all customers with refills due or missed */
  refillDashboard: protectedProcedure
    .input(
      z.object({
        view: z
          .enum(["due_this_week", "missed", "needs_fresh_rx"])
          .default("due_this_week"),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDbSafe();
      const { refillPlans, products, users } = await import(
        "../../drizzle/schema"
      );

      const today = new Date();
      const sevenDaysFromNow = new Date(today);
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

      let conditions;
      if (input.view === "due_this_week") {
        conditions = and(
          eq(refillPlans.status, "active"),
          lte(refillPlans.nextDueDate, sevenDaysFromNow),
          gte(refillPlans.nextDueDate, today)
        );
      } else if (input.view === "missed") {
        conditions = and(
          eq(refillPlans.status, "active"),
          lte(refillPlans.nextDueDate, today)
        );
      } else {
        conditions = and(
          eq(refillPlans.status, "active"),
          eq(refillPlans.needsFreshRx, true)
        );
      }

      const rows = await db
        .select({
          planId: refillPlans.id,
          userId: refillPlans.userId,
          customerName: users.name,
          customerPhone: users.phone,
          productId: refillPlans.productId,
          productName: products.name,
          nextDueDate: refillPlans.nextDueDate,
          qty: refillPlans.qty,
          needsFreshRx: refillPlans.needsFreshRx,
          prescriptionExpiryDate: refillPlans.prescriptionExpiryDate,
        })
        .from(refillPlans)
        .leftJoin(products, eq(refillPlans.productId, products.id))
        .leftJoin(users, eq(refillPlans.userId, users.id))
        .where(conditions)
        .orderBy(asc(refillPlans.nextDueDate))
        .limit(100);

      return { rows };
    }),
});

export const customerMedicineRouterExtension = {
  consent: consentRouter,
  admin: adminCustomerRouter,
};
