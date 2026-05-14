import { createHash, randomUUID } from "crypto";
import pino from "pino";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { commandLog, commandOutbox } from "../../drizzle/schema";
import { emitSloEvent, SLO_DEFINITIONS } from "./sloService";
import { assertTransition } from "./commandStateMachine";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

type DbInstance = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type DbTx = Parameters<Parameters<DbInstance["transaction"]>[0]>[0];

export type CommandContext = {
  actorUserId: string | null;
  actorRole: string | null;
  storeId: string | null;
  traceId: string | null;
};

export type SideEffect = {
  kind: string;
  payload: unknown;
  maxAttempts?: number;
};

export type CommandResult<TOutput> = {
  output: TOutput;
  sideEffects: SideEffect[];
};

export type CommandHandler<TInput, TOutput> = (
  input: TInput,
  tx: DbInstance,
  ctx: CommandContext
) => Promise<CommandResult<TOutput>>;

export type ExecuteCommandOptions<TInput, TOutput> = {
  name: string;
  version: number;
  idempotencyKey: string;
  input: TInput;
  context: CommandContext;
  handler: CommandHandler<TInput, TOutput>;
  sloName?: string;
};

export class IdempotencyMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdempotencyMismatchError";
  }
}

export class CommandInFlightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommandInFlightError";
  }
}

export class CommandPriorFailureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommandPriorFailureError";
  }
}

function findSloTarget(sloName: string): number {
  return SLO_DEFINITIONS.find(d => d.name === sloName)?.target ?? 0.99;
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(value).sort()) {
    sorted[k] = canonicalize((value as Record<string, unknown>)[k]);
  }
  return sorted;
}

function computeInputHash(input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(input)))
    .digest("hex");
}

export async function executeCommand<TInput, TOutput>(
  options: ExecuteCommandOptions<TInput, TOutput>
): Promise<TOutput> {
  const started = Date.now();
  const inputHash = computeInputHash(options.input);

  const db = await getDb();
  if (!db) {
    throw new Error("Database unavailable; cannot execute command");
  }

  // 1. Idempotency check
  const existing = await db
    .select()
    .from(commandLog)
    .where(
      and(
        eq(commandLog.idempotencyKey, options.idempotencyKey),
        eq(commandLog.commandName, options.name)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    const prior = existing[0];

    if (prior.inputHash !== inputHash) {
      throw new IdempotencyMismatchError(
        `Replay of ${options.name} with key ${options.idempotencyKey} has different input hash. Prior: ${prior.inputHash}, current: ${inputHash}.`
      );
    }

    if (prior.state === "completed") {
      logger.info(
        { commandName: options.name, idempotencyKey: options.idempotencyKey },
        "Command replayed; returning prior output"
      );
      return prior.outputPayload as TOutput;
    }

    if (prior.state === "in_flight") {
      throw new CommandInFlightError(
        `Command ${options.name} with key ${options.idempotencyKey} is still in flight (started ${prior.startedAt.toISOString()}).`
      );
    }

    // failed or compensated — terminal; require new key
    throw new CommandPriorFailureError(
      `Command ${options.name} with key ${options.idempotencyKey} previously failed: ${prior.errorMessage ?? "unknown error"}. Use a new idempotency key to retry.`
    );
  }

  // 2. Insert in_flight log entry (outside transaction so idempotency guard is visible)
  const commandId = randomUUID();

  await db.insert(commandLog).values({
    id: commandId,
    idempotencyKey: options.idempotencyKey,
    commandName: options.name,
    commandVersion: options.version,
    actorUserId: options.context.actorUserId,
    actorRole: options.context.actorRole,
    storeId: options.context.storeId,
    inputHash,
    inputPayload: options.input,
    state: "in_flight",
    startedAt: new Date(started),
    traceId: options.context.traceId,
  });

  try {
    let handlerResult!: CommandResult<TOutput>;

    await db.transaction(async (tx: DbTx) => {
      handlerResult = await options.handler(
        options.input,
        tx as unknown as DbInstance,
        options.context
      );

      for (const se of handlerResult.sideEffects) {
        await tx.insert(commandOutbox).values({
          id: randomUUID(),
          commandLogId: commandId,
          sideEffectKind: se.kind,
          sideEffectPayload: se.payload,
          maxAttempts:
            se.maxAttempts ?? Number(process.env.OUTBOX_MAX_ATTEMPTS ?? "5"),
        });
      }

      assertTransition("in_flight", "completed", "handler_success");

      const duration = Date.now() - started;
      await tx
        .update(commandLog)
        .set({
          state: "completed",
          outputPayload: handlerResult.output,
          completedAt: new Date(),
          durationMs: duration,
        })
        .where(eq(commandLog.id, commandId));
    });

    if (options.sloName) {
      const duration = Date.now() - started;
      const target = findSloTarget(options.sloName);
      emitSloEvent({
        sloName: options.sloName,
        target,
        measuredValue: duration,
        withinBudget: true,
        context: {
          commandName: options.name,
          idempotencyKey: options.idempotencyKey,
        },
      }).catch((err: unknown) =>
        logger.warn({ err }, "SLO emission failed (non-fatal)")
      );
    }

    return handlerResult.output;
  } catch (err) {
    const duration = Date.now() - started;
    const errorClass = err instanceof Error ? err.constructor.name : "Unknown";
    const errorMessage = err instanceof Error ? err.message : String(err);

    assertTransition("in_flight", "failed", "handler_failure");

    await db
      .update(commandLog)
      .set({
        state: "failed",
        errorClass,
        errorMessage,
        completedAt: new Date(),
        durationMs: duration,
      })
      .where(eq(commandLog.id, commandId))
      .catch((updateErr: unknown) => {
        logger.error(
          { updateErr },
          "Failed to mark command as failed in command_log"
        );
      });

    if (options.sloName) {
      const target = findSloTarget(options.sloName);
      emitSloEvent({
        sloName: options.sloName,
        target,
        measuredValue: duration,
        withinBudget: false,
        context: {
          commandName: options.name,
          idempotencyKey: options.idempotencyKey,
          errorClass,
        },
      }).catch(() => {});
    }

    throw err;
  }
}

export { canonicalize as _testOnlyCanonicalize };
