import { getDb } from "../db";
import { helpdeskTickets } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { logAudit } from "./audit";
import type { ResultSetHeader } from "mysql2";

export type SupportIssueType =
  | "order_status"
  | "rider_issue"
  | "missing_item"
  | "wrong_item"
  | "damaged_item"
  | "prescription_issue"
  | "payment_refund"
  | "cancellation_request"
  | "invoice_insurance_doc"
  | "refill_issue"
  | "pharmacist_callback"
  | "general";
const MEDICAL =
  /(prescription|dosage|medicine advice|substitute|rx|h1|schedule)/i;

export function triageSupportIssue(text: string, issueType?: SupportIssueType) {
  const needsHuman =
    issueType === "prescription_issue" ||
    issueType === "pharmacist_callback" ||
    MEDICAL.test(text);
  return {
    suggestedAction: needsHuman ? "escalate_pharmacist" : "ops_queue",
    needsHuman,
    category: issueType ?? "general",
  };
}

type TicketPriority = "low" | "normal" | "high" | "urgent";

interface CreateSupportTicketInput {
  userId: number;
  subject: string;
  description: string;
  issueType?: SupportIssueType | null;
  priority?: TicketPriority | null;
  orderId?: number | null;
}
interface TicketLike {
  createdAt: Date | string;
  status?: string | null;
}

export async function createSupportTicket(input: CreateSupportTicketInput) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const triage = triageSupportIssue(
    input.description,
    input.issueType ?? undefined
  );
  const insertResult = await db.insert(helpdeskTickets).values({
    userId: input.userId,
    subject: input.subject,
    description: input.description,
    category: triage.needsHuman ? "prescription" : "other",
    priority: input.priority ?? "normal",
    status: "open",
    orderId: input.orderId ?? null,
  });
  const [header] = insertResult as unknown as [ResultSetHeader];
  const ticketId = header.insertId;
  await logAudit({
    actorType: "user",
    actorId: input.userId,
    action: "support.ticket_created",
    entityType: "helpdesk_ticket",
    entityId: ticketId,
    reason: input.issueType ?? "general",
  });
  if (input.issueType === "cancellation_request")
    await logAudit({
      actorType: "user",
      actorId: input.userId,
      action: "support.cancellation_requested",
      entityType: "helpdesk_ticket",
      entityId: ticketId,
      afterJson: JSON.stringify({ handoff: "sales.cancellation.flow" }),
    });
  return {
    ticketId,
    triage,
    handoff:
      input.issueType === "cancellation_request"
        ? { target: "sales.cancellation.flow", directMutation: false }
        : null,
  };
}
export async function addSupportMessage(ticketId: number, message: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [t] = await db
    .select()
    .from(helpdeskTickets)
    .where(eq(helpdeskTickets.id, ticketId))
    .limit(1);
  if (!t) throw new Error("Not found");
  await db
    .update(helpdeskTickets)
    .set({ description: `${t.description}\n\n[MSG] ${message}` })
    .where(eq(helpdeskTickets.id, ticketId));
  return { ok: true };
}
export async function escalateToHuman(ticketId: number, reason: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(helpdeskTickets)
    .set({
      status: "in_progress",
      priority: "urgent",
      resolutionNote: `Escalated: ${reason}`,
    })
    .where(eq(helpdeskTickets.id, ticketId));
  return { ok: true };
}
export async function linkTicketToOrder(ticketId: number, orderId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(helpdeskTickets)
    .set({ orderId })
    .where(eq(helpdeskTickets.id, ticketId));
  return { ok: true };
}
export async function linkTicketToDelivery(
  ticketId: number,
  deliveryTaskId: number
) {
  return addSupportMessage(ticketId, `Linked deliveryTaskId=${deliveryTaskId}`);
}
export async function closeSupportTicket(ticketId: number, note?: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(helpdeskTickets)
    .set({
      status: "closed",
      resolutionNote: note ?? "Closed",
      resolvedAt: new Date(),
    })
    .where(eq(helpdeskTickets.id, ticketId));
  return { ok: true };
}
export async function getSupportQueue() {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db
    .select()
    .from(helpdeskTickets)
    .orderBy(desc(helpdeskTickets.createdAt))
    .limit(100);
}
export function getSupportSlaStatus(ticket: TicketLike) {
  const created = new Date(ticket.createdAt);
  const mins = Math.round((Date.now() - created.getTime()) / 60000);
  return {
    breached: mins > 30 && ticket.status !== "closed",
    elapsedMins: mins,
    targetMins: 30,
  };
}
