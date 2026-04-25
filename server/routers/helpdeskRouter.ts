/**
 * Helpdesk Router
 *
 * tRPC procedures for customer grievance and support ticket management.
 * Customers can create and view their own tickets.
 * Admins can view all tickets and resolve them.
 */

import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../db";
import { helpdeskTickets } from "../../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";

export const helpdeskRouter = router({
  /**
   * Create a new support ticket.
   * Available to all authenticated users.
   */
  create: protectedProcedure
    .input(
      z.object({
        category: z.enum(["order", "prescription", "delivery", "billing", "product", "account", "other"]),
        subject: z.string().min(5).max(255),
        description: z.string().min(10).max(5000),
        orderId: z.number().int().positive().optional(),
        prescriptionId: z.number().int().positive().optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [result] = await db.insert(helpdeskTickets).values({
        userId: ctx.user.id,
        category: input.category,
        subject: input.subject,
        description: input.description,
        orderId: input.orderId ?? null,
        prescriptionId: input.prescriptionId ?? null,
        priority: input.priority,
        status: "open",
      });

      const ticketId = (result as any).insertId as number;

      // Notify owner of new ticket
      await notifyOwner({
        title: `New support ticket #${ticketId}`,
        content: `Category: ${input.category} | Priority: ${input.priority}\nSubject: ${input.subject}\nFrom user #${ctx.user.id}`,
      }).catch(() => {}); // non-blocking

      return { ticketId };
    }),

  /**
   * List the current user's own tickets.
   */
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
        limit: z.number().int().min(1).max(50).default(20),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const condition = input.status
        ? and(
            eq(helpdeskTickets.userId, ctx.user.id),
            eq(helpdeskTickets.status, input.status)
          )
        : eq(helpdeskTickets.userId, ctx.user.id);

      const tickets = await db
        .select()
        .from(helpdeskTickets)
        .where(condition)
        .orderBy(desc(helpdeskTickets.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return tickets;
    }),

  /**
   * Get a single ticket (user can only see their own; admin can see any).
   */
  get: protectedProcedure
    .input(z.object({ ticketId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const tickets = await db
        .select()
        .from(helpdeskTickets)
        .where(eq(helpdeskTickets.id, input.ticketId))
        .limit(1);

      if (tickets.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
      }

      const ticket = tickets[0];

      // Non-admin users can only view their own tickets
      if (ctx.user.role !== "admin" && ticket.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      return ticket;
    }),

  /**
   * List all tickets (admin only).
   * Supports filtering by status, category, and priority.
   */
  listAll: adminProcedure
    .input(
      z.object({
        status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
        category: z.enum(["order", "prescription", "delivery", "billing", "product", "account", "other"]).optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Build conditions
      const conditions = [];
      if (input.status) conditions.push(eq(helpdeskTickets.status, input.status));
      if (input.category) conditions.push(eq(helpdeskTickets.category, input.category));
      if (input.priority) conditions.push(eq(helpdeskTickets.priority, input.priority));

      const tickets = await db
        .select()
        .from(helpdeskTickets)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(helpdeskTickets.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return tickets;
    }),

  /**
   * Update ticket status (admin only).
   * Can transition to in_progress, resolved, or closed.
   */
  updateStatus: adminProcedure
    .input(
      z.object({
        ticketId: z.number().int().positive(),
        status: z.enum(["in_progress", "resolved", "closed"]),
        resolutionNote: z.string().max(2000).optional(),
        assignedTo: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const updateData: Record<string, unknown> = {
        status: input.status,
      };

      if (input.resolutionNote) updateData.resolutionNote = input.resolutionNote;
      if (input.assignedTo) updateData.assignedTo = input.assignedTo;
      if (input.status === "resolved" || input.status === "closed") {
        updateData.resolvedAt = new Date();
      }

      await db
        .update(helpdeskTickets)
        .set(updateData)
        .where(eq(helpdeskTickets.id, input.ticketId));

      return { success: true };
    }),

  /**
   * Resolve a ticket with a resolution note (admin only).
   * Convenience wrapper around updateStatus.
   */
  resolve: adminProcedure
    .input(
      z.object({
        ticketId: z.number().int().positive(),
        resolutionNote: z.string().min(5).max(2000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db
        .update(helpdeskTickets)
        .set({
          status: "resolved",
          resolutionNote: input.resolutionNote,
          resolvedAt: new Date(),
          assignedTo: ctx.user.id,
        })
        .where(eq(helpdeskTickets.id, input.ticketId));

      return { success: true };
    }),
});
