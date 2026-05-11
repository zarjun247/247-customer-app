import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { staffDeviceSessions } from "../../drizzle/schema";
import { getDb } from "../db";
import { logAudit } from "./audit";
import {
  hasActiveStaffAcknowledgement,
  type InMemoryStaffSecurityStore,
  type StaffAcknowledgementType,
  type StaffDeviceSessionRecord,
} from "./staffSessionSecurity";
import { redactSensitiveForLogs } from "./sensitiveDataPolicy";

export const CANONICAL_ROLES = [
  "customer",
  "rider",
  "staff",
  "pharmacist",
  "store_manager",
  "ops_manager",
  "finance",
  "admin",
  "super_admin",
  "system",
] as const;

export type CanonicalRole = (typeof CANONICAL_ROLES)[number];

export const RBAC_ROLE_ALIASES: Record<string, CanonicalRole> = {
  user: "customer",
  customer: "customer",
  rider: "rider",
  delivery_operator: "rider",
  staff: "staff",
  cashier: "staff",
  salesman: "staff",
  inventory_operator: "staff",
  auditor: "staff",
  pharmacist: "pharmacist",
  store_manager: "store_manager",
  purchase_manager: "store_manager",
  ops_admin: "ops_manager",
  accountant: "finance",
  finance: "finance",
  admin: "admin",
  super_admin: "super_admin",
  system: "system",
};

export const RBAC_PERMISSIONS = [
  "admin.dashboard.view",
  "pharmacy.os.access",
  "pos.sale.create",
  "pos.sale.confirm",
  "prescription.view",
  "prescription.review",
  "regulated.release.approve",
  "h1.register.create",
  "inventory.view",
  "inventory.adjust",
  "purchase.create",
  "purchase.commit",
  "refund.initiate",
  "refund.approve",
  "credit_note.issue",
  "supplier.payment.create",
  "accounting.export",
  "reports.view",
  "staff.session.revoke",
  "settings.manage",
  "provider.health.view",
  "audit.view",
] as const;

export type RbacPermission = (typeof RBAC_PERMISSIONS)[number];

const rolePermissions = {
  customer: [] as RbacPermission[],
  rider: [] as RbacPermission[],
  staff: [
    "pharmacy.os.access",
    "pos.sale.create",
    "pos.sale.confirm",
    "inventory.view",
  ] as RbacPermission[],
  pharmacist: [
    "pharmacy.os.access",
    "pos.sale.create",
    "pos.sale.confirm",
    "prescription.view",
    "prescription.review",
    "regulated.release.approve",
    "h1.register.create",
    "inventory.view",
  ] as RbacPermission[],
  store_manager: [
    "admin.dashboard.view",
    "pharmacy.os.access",
    "pos.sale.create",
    "pos.sale.confirm",
    "prescription.view",
    "prescription.review",
    "regulated.release.approve",
    "h1.register.create",
    "inventory.view",
    "inventory.adjust",
    "purchase.create",
    "purchase.commit",
    "refund.initiate",
    "refund.approve",
    "credit_note.issue",
    "reports.view",
    "staff.session.revoke",
  ] as RbacPermission[],
  ops_manager: [
    "admin.dashboard.view",
    "pharmacy.os.access",
    "pos.sale.create",
    "pos.sale.confirm",
    "prescription.view",
    "prescription.review",
    "regulated.release.approve",
    "h1.register.create",
    "inventory.view",
    "inventory.adjust",
    "purchase.create",
    "purchase.commit",
    "refund.initiate",
    "refund.approve",
    "credit_note.issue",
    "supplier.payment.create",
    "accounting.export",
    "reports.view",
    "staff.session.revoke",
    "provider.health.view",
    "audit.view",
  ] as RbacPermission[],
  finance: [
    "admin.dashboard.view",
    "refund.initiate",
    "refund.approve",
    "credit_note.issue",
    "supplier.payment.create",
    "accounting.export",
    "reports.view",
  ] as RbacPermission[],
  admin: RBAC_PERMISSIONS.filter(p => p !== "staff.session.revoke"),
  super_admin: [...RBAC_PERMISSIONS],
  system: [...RBAC_PERMISSIONS],
} satisfies Record<CanonicalRole, RbacPermission[]>;

export const RBAC_ROLE_PERMISSIONS: Readonly<
  Record<CanonicalRole, readonly RbacPermission[]>
> = rolePermissions;

export const SENSITIVE_ACTIONS = {
  "prescription.vault.access": {
    permissions: ["prescription.view"],
    freshSession: true,
    freshnessMinutes: 15,
  },
  "prescription.review": {
    permissions: ["prescription.review"],
    freshSession: true,
    freshnessMinutes: 15,
  },
  "regulated.release.approve": {
    permissions: ["regulated.release.approve"],
    freshSession: true,
    freshnessMinutes: 10,
  },
  "h1.register.create": {
    permissions: ["h1.register.create"],
    freshSession: true,
    freshnessMinutes: 10,
  },
  "refund.initiate": {
    permissions: ["refund.initiate"],
    freshSession: true,
    freshnessMinutes: 10,
  },
  "refund.approve": {
    permissions: ["refund.approve"],
    freshSession: true,
    freshnessMinutes: 10,
  },
  "credit_note.issue": {
    permissions: ["credit_note.issue"],
    freshSession: true,
    freshnessMinutes: 10,
  },
  "inventory.adjust.approve": {
    permissions: ["inventory.adjust"],
    freshSession: true,
    freshnessMinutes: 10,
  },
  "purchase.commit": {
    permissions: ["purchase.commit"],
    freshSession: true,
    freshnessMinutes: 10,
  },
  "supplier.payment.create": {
    permissions: ["supplier.payment.create"],
    freshSession: true,
    freshnessMinutes: 10,
  },
  "accounting.export": {
    permissions: ["accounting.export"],
    freshSession: true,
    freshnessMinutes: 10,
  },
  "staff.session.revoke": {
    permissions: ["staff.session.revoke"],
    freshSession: true,
    freshnessMinutes: 5,
  },
  "provider.health.view": {
    permissions: ["provider.health.view"],
    freshSession: true,
    freshnessMinutes: 10,
  },
  "audit.export": {
    permissions: ["audit.view"],
    freshSession: true,
    freshnessMinutes: 10,
  },
} as const;

export type SensitiveAction = keyof typeof SENSITIVE_ACTIONS;

export type RbacContext = {
  user?: {
    id?: number | null;
    role?: string | null;
    staffStoreId?: number | null;
  } | null;
  req?: {
    headers?: Record<string, string | string[] | undefined>;
    ip?: string;
  };
  session?: { id?: string | null } | null;
  staffSession?: StaffDeviceSessionRecord | null;
  staffSessionStore?: InMemoryStaffSecurityStore;
  now?: Date;
};

export function normalizeRole(
  role: string | null | undefined
): CanonicalRole | null {
  if (!role) return null;
  return RBAC_ROLE_ALIASES[role] ?? null;
}

export function hasPermission(
  role: string | null | undefined,
  permission: RbacPermission
): boolean {
  const canonical = normalizeRole(role);
  if (!canonical) return false;
  return RBAC_ROLE_PERMISSIONS[canonical].includes(permission);
}

export function requireRole(
  ctx: RbacContext,
  role: CanonicalRole
): CanonicalRole {
  const actual = normalizeRole(ctx.user?.role);
  if (actual !== role)
    throw new TRPCError({
      code: ctx.user ? "FORBIDDEN" : "UNAUTHORIZED",
      message: "Required role not present",
    });
  return actual;
}

export function requirePermission(
  ctx: RbacContext,
  permission: RbacPermission
): CanonicalRole {
  const actual = normalizeRole(ctx.user?.role);
  if (!ctx.user)
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  if (!actual || !hasPermission(ctx.user.role, permission))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Required permission not present",
    });
  return actual;
}

export function requireAnyPermission(
  ctx: RbacContext,
  permissions: readonly RbacPermission[]
): CanonicalRole {
  const actual = normalizeRole(ctx.user?.role);
  if (!ctx.user)
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  if (
    !actual ||
    !permissions.some(permission => hasPermission(ctx.user?.role, permission))
  )
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Required permission not present",
    });
  return actual;
}

function firstHeader(ctx: RbacContext, name: string) {
  const value =
    ctx.req?.headers?.[name] ?? ctx.req?.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

export function resolveStaffSessionId(ctx: RbacContext): string | null {
  return (
    ctx.staffSession?.sessionId ??
    ctx.session?.id ??
    firstHeader(ctx, "x-staff-session-id") ??
    firstHeader(ctx, "x-session-id") ??
    null
  );
}

async function findStaffSession(
  ctx: RbacContext
): Promise<StaffDeviceSessionRecord | null> {
  if (ctx.staffSession) return ctx.staffSession;
  const sessionId = resolveStaffSessionId(ctx);
  const staffId = ctx.user?.id;
  if (!sessionId || staffId == null) return null;
  if (ctx.staffSessionStore) {
    return (
      ctx.staffSessionStore.sessions.find(
        row => row.staffId === staffId && row.sessionId === sessionId
      ) ?? null
    );
  }
  const db = await getDb();
  if (!db) return null;
  const [session] = await db
    .select()
    .from(staffDeviceSessions)
    .where(
      and(
        eq(staffDeviceSessions.staffId, staffId),
        eq(staffDeviceSessions.sessionId, sessionId)
      )
    )
    .limit(1);
  return session ?? null;
}

export async function requireActiveStaffSession(
  ctx: RbacContext
): Promise<StaffDeviceSessionRecord> {
  const role = normalizeRole(ctx.user?.role);
  if (!role || role === "customer" || role === "system")
    throw new TRPCError({
      code: ctx.user ? "FORBIDDEN" : "UNAUTHORIZED",
      message: "Active staff session required",
    });
  const session = await findStaffSession(ctx);
  if (
    !session ||
    session.staffId !== ctx.user?.id ||
    session.status !== "active"
  )
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Active staff session required",
    });
  if ((session as any).suspicious || (session as any).requiresReauth)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Staff re-authentication required",
    });
  return session;
}

export async function requireFreshSession(
  ctx: RbacContext,
  options?: { freshnessMinutes?: number; now?: Date }
): Promise<StaffDeviceSessionRecord> {
  const session = await requireActiveStaffSession(ctx);
  const now = options?.now ?? ctx.now ?? new Date();
  const freshnessMs = (options?.freshnessMinutes ?? 15) * 60_000;
  const freshnessAnchor = session.privilegedLastSeenAt ?? session.lastSeenAt;
  const lastSeen = new Date(freshnessAnchor).getTime();
  if (!Number.isFinite(lastSeen) || now.getTime() - lastSeen > freshnessMs)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Fresh staff session required",
    });
  return session;
}

export async function requireSopAcknowledgement(
  ctx: RbacContext,
  sopType: StaffAcknowledgementType,
  version = "current"
): Promise<void> {
  if (!ctx.user?.id)
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  const acknowledged = await hasActiveStaffAcknowledgement(
    ctx.user.id,
    sopType,
    version,
    ctx.staffSessionStore
  );
  if (!acknowledged)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "SOP acknowledgement required",
    });
}

function safeAuditPayload(
  ctx: RbacContext,
  action: string,
  decision: "allowed" | "denied",
  reason?: string,
  permission?: string
) {
  return redactSensitiveForLogs({
    actorId: ctx.user?.id ?? null,
    actorRole: normalizeRole(ctx.user?.role) ?? ctx.user?.role ?? null,
    action,
    permission,
    decision,
    reason,
    sessionId: resolveStaffSessionId(ctx),
    timestamp: (ctx.now ?? new Date()).toISOString(),
  });
}

async function auditSensitiveDecision(
  ctx: RbacContext,
  action: string,
  decision: "allowed" | "denied",
  reason?: string,
  permission?: string
) {
  const afterJson = safeAuditPayload(ctx, action, decision, reason, permission);
  if (ctx.staffSessionStore) {
    await ctx.staffSessionStore.audit("rbac.sensitive_action", afterJson);
    return;
  }
  await logAudit(
    {
      actorId: ctx.user?.id ?? null,
      actorRole: ctx.user?.role ?? null,
      actorType: ctx.user?.id ? "user" : "system",
      action: "rbac.sensitive_action",
      entityType: "rbac_decision",
      entityRef: action,
      afterJson,
      reason,
      source: "rbac",
    },
    ctx as any
  );
}

export async function assertSensitiveActionAllowed(
  ctx: RbacContext,
  action: SensitiveAction
): Promise<void> {
  const policy = SENSITIVE_ACTIONS[action];
  try {
    const role = requireAnyPermission(ctx, policy.permissions);
    if (policy.freshSession)
      await requireFreshSession(ctx, {
        freshnessMinutes: policy.freshnessMinutes,
      });
    await auditSensitiveDecision(
      ctx,
      action,
      "allowed",
      undefined,
      policy.permissions.join("|")
    );
  } catch (error) {
    const reason =
      error instanceof TRPCError ? error.message : "Sensitive action denied";
    await auditSensitiveDecision(
      ctx,
      action,
      "denied",
      reason,
      policy.permissions.join("|")
    );
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Sensitive action denied",
    });
  }
}
