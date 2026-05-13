import { z } from "zod";
import { adminProcedure, managerProcedure, router } from "../_core/trpc";
import {
  listProviderHealthSnapshots,
  getProviderHealthDrilldown,
  emitProviderHealthSloEvent,
} from "../services/providerHealthService";

export const providerHealthRouter = router({
  snapshots: managerProcedure.query(async () => {
    return listProviderHealthSnapshots();
  }),

  drilldown: managerProcedure
    .input(
      z.object({
        providerType: z.string().min(1),
        providerId: z.string().min(1),
      })
    )
    .query(async ({ input }) => {
      return getProviderHealthDrilldown(input.providerType, input.providerId);
    }),

  sloEmit: adminProcedure
    .input(
      z.object({
        providerType: z.string().min(1),
        providerId: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      const snapshots = await listProviderHealthSnapshots();
      const snapshot = snapshots.find(
        s =>
          s.providerType === input.providerType &&
          s.providerId === input.providerId
      );
      if (!snapshot) {
        return { emitted: false, reason: "provider_not_found_in_snapshots" };
      }
      await emitProviderHealthSloEvent(input.providerType, snapshot);
      return { emitted: true, snapshot };
    }),
});
