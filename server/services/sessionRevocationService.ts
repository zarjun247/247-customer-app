/**
 * sessionRevocationService.ts
 *
 * Production-grade session invalidation via token versioning.
 *
 * Design:
 *   - users.tokenVersion is embedded in every JWT at signing time.
 *   - On every authenticated request the stored tokenVersion is compared to
 *     the JWT claim.  A mismatch means the token was issued before a revocation
 *     event and is rejected immediately.
 *   - Revocation events: logout, admin-revoke, password-reset, suspension.
 *
 * This avoids a per-request revocation-table lookup while still providing
 * instant invalidation: incrementing tokenVersion in the DB is O(1) and
 * the comparison happens inside the existing DB user-fetch that already
 * occurs on every authenticated request.
 */
import { eq, sql } from "drizzle-orm";
import { users } from "../../drizzle/schema";
import { getDb } from "../db";
import { logAudit, type CtxLike } from "./audit";

export const TOKEN_VERSION_CLAIM = "tv" as const;

/**
 * Increment the tokenVersion for a user, invalidating all previously issued
 * JWTs.  Returns the new version number.
 */
export async function revokeUserSessions(
  userId: number,
  opts: {
    reason: "logout" | "admin_revoke" | "password_reset" | "suspension";
    actorId?: number | null;
    ctx?: { requestId?: string | null } | null;
  }
): Promise<{ newVersion: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  await db
    .update(users)
    .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
    .where(eq(users.id, userId));

  const [updated] = await db
    .select({ tokenVersion: users.tokenVersion })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const newVersion = updated?.tokenVersion ?? 1;

  const auditCtx: CtxLike | undefined =
    opts.actorId != null ? { user: { id: opts.actorId } } : undefined;
  await logAudit(
    {
      action: "session.revoked",
      entityType: "user",
      entityId: userId,
      afterJson: { reason: opts.reason, newTokenVersion: newVersion },
    },
    auditCtx
  );

  return { newVersion };
}

/**
 * Verify that the tokenVersion claim in a JWT matches the stored version.
 * Returns true if the token is still valid, false if it has been revoked.
 *
 * Call this inside authenticateRequest after fetching the user row.
 */
export function isTokenVersionValid(
  user: { tokenVersion?: number | null },
  claimedVersion: number | undefined | null
): boolean {
  // Both the DB column (pre-migration rows) and the JWT claim (tokens issued
  // before this feature was deployed) may be absent.  Treat both as version 0
  // so that existing sessions remain valid after the migration is applied.
  const dbVersion = user.tokenVersion ?? 0;
  const claimed = claimedVersion ?? 0;
  return dbVersion === claimed;
}
