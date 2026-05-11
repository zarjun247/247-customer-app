import { z } from "zod";
import { adminProcedure, managerProcedure, router } from "../_core/trpc";
import {
  getCommandLog,
  getCommandStats,
  listCommandLogs,
} from "../services/commandLogService";
import type { CommandState } from "../services/commandStateMachine";

const commandStateEnum = z.enum([
  "in_flight",
  "completed",
  "failed",
  "compensated",
]);

export const commandLogRouter = router({
  list: managerProcedure
    .input(
      z.object({
        commandName: z.string().optional(),
        state: commandStateEnum.optional(),
        actorUserId: z.string().optional(),
        storeId: z.string().optional(),
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      return listCommandLogs({
        commandName: input.commandName,
        state: input.state as CommandState | undefined,
        actorUserId: input.actorUserId,
        storeId: input.storeId,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  get: managerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const record = await getCommandLog(input.id);
      if (!record) return null;
      return record;
    }),

  stats: adminProcedure
    .input(z.object({ windowHours: z.number().min(1).max(720).default(24) }))
    .query(async ({ input }) => {
      return getCommandStats(input.windowHours);
    }),
});
