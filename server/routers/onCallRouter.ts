import { z } from "zod";
import {
  adminProcedure,
  managerProcedure,
  router,
  capabilityProcedure,
} from "../_core/trpc";
import {
  getCurrentOnCall,
  listUpcomingShifts,
  upsertShift,
  listAllShifts,
} from "../services/onCallRota";

const OnCallRoleEnum = z.enum([
  "incident_commander",
  "pharmacist_in_charge",
  "platform_owner",
  "provider_owner",
]);

const OnCallShiftSchema = z.object({
  id: z.string().min(1),
  role: OnCallRoleEnum,
  primaryUserId: z.string().min(1),
  secondaryUserId: z.string().optional(),
  escalationUserId: z.string().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  timezone: z.string().min(1),
});

export const onCallRouter = router({
  current: managerProcedure
    .input(z.object({ role: OnCallRoleEnum }))
    .query(async ({ input }) => {
      return getCurrentOnCall(input.role);
    }),

  upcoming: managerProcedure
    .input(
      z.object({
        role: OnCallRoleEnum,
        days: z.number().int().min(1).max(90).default(7),
      })
    )
    .query(async ({ input }) => {
      return listUpcomingShifts(input.role, input.days);
    }),

  upsert: capabilityProcedure("chaos.trigger")
    .input(OnCallShiftSchema)
    .mutation(async ({ input }) => {
      await upsertShift(input);
      return { success: true, id: input.id };
    }),

  listAll: adminProcedure.query(async () => {
    return listAllShifts();
  }),
});
