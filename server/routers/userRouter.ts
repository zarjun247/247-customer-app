import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  getUserById,
  getBuildingById,
  updateUserProfile,
  getBuildings,
  writeAuditLog,
} from "../db";
import { resolveStore } from "../routing";
import { checkServiceability } from "../location";

export const userRouter = router({
  /** Returns the authenticated user's profile, including their resolved building name if set. */
  profile: protectedProcedure.query(async ({ ctx }) => {
    const user = await getUserById(ctx.user.id);
    if (!user) return null;
    let buildingName: string | null = null;
    if (user.buildingId) {
      const building = await getBuildingById(user.buildingId);
      buildingName = building?.name ?? null;
    }
    return { ...user, buildingName };
  }),
  /** Saves the user's onboarding details and resolves their assigned store from building or coordinates. */
  completeOnboarding: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        phone: z.string().optional(),
        buildingId: z.number().optional(),
        flatNumber: z.string().optional(),
        userAddress: z.string().optional(),
        userLat: z.number().optional(),
        userLng: z.number().optional(),
        assignedStoreId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (
        !input.buildingId &&
        (!input.userAddress ||
          input.userLat === undefined ||
          input.userLng === undefined)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Either a building selection or a valid address with coordinates is required.",
        });
      }
      if (input.buildingId) {
        const building = await getBuildingById(input.buildingId);
        if (!building) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Building not found",
          });
        }
      }
      let resolvedStoreId: number | undefined;
      if (input.buildingId) {
        const result = await resolveStore({ buildingId: input.buildingId });
        if (!result)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No serviceable store found for building",
          });
        resolvedStoreId = result.storeId;
      } else if (input.userLat !== undefined && input.userLng !== undefined) {
        const svc = await checkServiceability(input.userLat, input.userLng);
        if (!svc?.serviceable || !svc.storeId)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Address not serviceable",
          });
        resolvedStoreId = svc.storeId;
      }

      if (!resolvedStoreId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No serviceable store found for address",
        });
      }

      await updateUserProfile(ctx.user.id, {
        name: input.name,
        phone: input.phone,
        buildingId: input.buildingId,
        flatNumber: input.flatNumber,
        userAddress: input.userAddress,
        userLat:
          input.userLat !== undefined ? String(input.userLat) : undefined,
        userLng:
          input.userLng !== undefined ? String(input.userLng) : undefined,
        assignedStoreId: resolvedStoreId,
        onboardingComplete: true,
      });
      await writeAuditLog(
        ctx.user.id,
        "onboarding_complete",
        "user",
        ctx.user.id,
        input
      );
      return { success: true, assignedStoreId: resolvedStoreId };
    }),
  /** Returns all available buildings for address selection during onboarding (public, no auth required). */
  buildings: publicProcedure.query(() => getBuildings()),
});
