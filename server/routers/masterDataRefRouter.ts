/**
 * masterDataRouterExtension.ts — second half of masterDataRouter sub-routers
 * Covers: printers, customers, doctorMaster, patientCategories, staff,
 *         stores, buildings, printerMaster, products
 */
import {
  doctorMasterRouter,
  patientCategoryRouter,
  staffMasterRouter,
  storeMasterRouter,
  buildingMasterRouter,
  printerMasterRouter,
  productMasterRouter,
} from "./masterDataCatalogRouter";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";

type StaffRole =
  | "admin"
  | "super_admin"
  | "store_manager"
  | "pharmacist"
  | "purchase_manager"
  | "accountant"
  | "cashier"
  | "salesman"
  | "inventory_operator"
  | "delivery_operator"
  | "auditor";
const STAFF_ROLES: StaffRole[] = [
  "admin",
  "super_admin",
  "store_manager",
  "pharmacist",
  "purchase_manager",
  "accountant",
  "cashier",
  "salesman",
  "inventory_operator",
  "delivery_operator",
  "auditor",
];

function requireStaff(role: string) {
  if (!STAFF_ROLES.includes(role as StaffRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Staff access required.",
    });
  }
}
function requireManager(role: string) {
  if (
    !["admin", "super_admin", "store_manager", "purchase_manager"].includes(
      role
    )
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Manager access required.",
    });
  }
}

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown): string => {
    let s: string;
    if (v === null || v === undefined) {
      s = "";
    } else if (typeof v === "object") {
      s = JSON.stringify(v);
    } else {
      const prim = v as string | number | boolean | bigint;
      s = String(prim);
    }
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  return [
    headers.join(","),
    ...rows.map(r => headers.map(h => escape(r[h])).join(",")),
  ].join("\n");
}

const printerRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    requireStaff(ctx.user.role);
    const db = await getDbSafe();
    const { printers } = await import("../../drizzle/schema");
    return db.select().from(printers).orderBy(printers.printerName);
  }),

  upsert: protectedProcedure
    .input(
      z.object({
        id: z.number().optional(),
        printerName: z.string().min(1),
        printerType: z.enum(["bill", "barcode", "a4", "thermal"]),
        assignedTerminal: z.string().optional(),
        assignedStoreId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDbSafe();
      const { printers } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      if (input.id) {
        await db.update(printers).set(input).where(eq(printers.id, input.id));
        return { id: input.id };
      }
      const [result] = await db.insert(printers).values(input);
      return { id: (result as { insertId: number }).insertId };
    }),
});

const customerListRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(100),
      })
    )
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user.role);
      const db = await getDbSafe();
      const { users } = await import("../../drizzle/schema");
      const { like, or, desc } = await import("drizzle-orm");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      let where: any = undefined;
      if (input.search) {
        where = or(
          like(users.name, `%${input.search}%`),
          like(users.phone, `%${input.search}%`),
          like(users.email, `%${input.search}%`)
        );
      }
      return (
        db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            phone: users.phone,
            role: users.role,
            createdAt: users.createdAt,
            lastSignedIn: users.lastSignedIn,
          })
          .from(users)
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          .where(where)
          .orderBy(desc(users.createdAt))
          .limit(input.limit)
      );
    }),
});

export const masterDataRouterExtension = {
  printers: printerRouter,
  customers: customerListRouter,
  // Part 3
  doctorMaster: doctorMasterRouter,
  patientCategories: patientCategoryRouter,
  staff: staffMasterRouter,
  stores: storeMasterRouter,
  buildings: buildingMasterRouter,
  printerMaster: printerMasterRouter,
  products: productMasterRouter,
};
