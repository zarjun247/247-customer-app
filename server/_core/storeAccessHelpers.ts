import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./context";
import { requireStoreAccess } from "./rbac";
import { ENV } from "./env";

export { requireStoreAccessForEntity, requireStoreAccessForUserAtStore } from "../middleware/storeScope";

/**
 * Inline guard: asserts the caller's store matches the given storeId.
 * Throws FORBIDDEN if the user's store doesn't match and they're not super_admin.
 * Respects STORE_SCOPE_ENFORCEMENT_MODE — safe to call from any procedure.
 */
export function assertStoreIdMatchesUser(ctx: TrpcContext, storeId: number): void {
  if (ENV.storeScopeEnforcementMode === "off") return;
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  requireStoreAccess(ctx.user, storeId, { allowAdminCrossStore: false });
}
