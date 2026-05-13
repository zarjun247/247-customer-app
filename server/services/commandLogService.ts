import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../db";
import { commandLog, type CommandLogRecord } from "../../drizzle/schema";
import type { CommandState } from "./commandStateMachine";

export type CommandLogListInput = {
  commandName?: string;
  state?: CommandState;
  actorUserId?: string;
  storeId?: string;
  limit?: number;
  offset?: number;
};

export async function listCommandLogs(
  input: CommandLogListInput
): Promise<{ records: CommandLogRecord[]; total: number }> {
  const db = await getDb();
  if (!db) return { records: [], total: 0 };

  const conditions = [];
  if (input.commandName)
    conditions.push(eq(commandLog.commandName, input.commandName));
  if (input.state) conditions.push(eq(commandLog.state, input.state));
  if (input.actorUserId)
    conditions.push(eq(commandLog.actorUserId, input.actorUserId));
  if (input.storeId) conditions.push(eq(commandLog.storeId, input.storeId));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;

  const [records, totalRows] = await Promise.all([
    db
      .select()
      .from(commandLog)
      .where(where)
      .orderBy(desc(commandLog.startedAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(commandLog).where(where),
  ]);

  return { records, total: Number(totalRows[0]?.total ?? 0) };
}

export async function getCommandLog(
  id: string
): Promise<CommandLogRecord | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(commandLog)
    .where(eq(commandLog.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export type CommandStats = {
  total: number;
  completed: number;
  failed: number;
  inFlight: number;
  byCommandName: Array<{ name: string; count: number; failureRate: number }>;
};

export async function getCommandStats(
  windowHours: number = 24
): Promise<CommandStats> {
  const db = await getDb();
  if (!db) {
    return {
      total: 0,
      completed: 0,
      failed: 0,
      inFlight: 0,
      byCommandName: [],
    };
  }

  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  const [summary, byName] = await Promise.all([
    db
      .select({
        total: count(),
        completed: sql<number>`SUM(CASE WHEN ${commandLog.state} = 'completed' THEN 1 ELSE 0 END)`,
        failed: sql<number>`SUM(CASE WHEN ${commandLog.state} = 'failed' THEN 1 ELSE 0 END)`,
        inFlight: sql<number>`SUM(CASE WHEN ${commandLog.state} = 'in_flight' THEN 1 ELSE 0 END)`,
      })
      .from(commandLog)
      .where(gte(commandLog.startedAt, since)),
    db
      .select({
        name: commandLog.commandName,
        total: count(),
        failed: sql<number>`SUM(CASE WHEN ${commandLog.state} = 'failed' THEN 1 ELSE 0 END)`,
      })
      .from(commandLog)
      .where(gte(commandLog.startedAt, since))
      .groupBy(commandLog.commandName)
      .orderBy(desc(count())),
  ]);

  const row = summary[0];
  return {
    total: Number(row?.total ?? 0),
    completed: Number(row?.completed ?? 0),
    failed: Number(row?.failed ?? 0),
    inFlight: Number(row?.inFlight ?? 0),
    byCommandName: byName.map(r => {
      const total = Number(r.total);
      const failed = Number(r.failed);
      return {
        name: r.name,
        count: total,
        failureRate: total > 0 ? failed / total : 0,
      };
    }),
  };
}
