/**
 * whatsappAdminExtension.ts — Admin sub-router for WhatsApp channel
 *
 * Extracted from whatsappMessagingRouter.ts to keep that file under 600 counted lines.
 * The exported adminRouter is spread into whatsappRouterExtension in whatsappMessagingRouter.ts.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  whatsappLinks,
  whatsappMessages,
  whatsappSessions,
  staffHandoffs,
  orders,
  users,
} from "../../drizzle/schema";

async function getDbSafe() {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "DB unavailable",
    });
  return db;
}

export const adminRouter = router({
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
