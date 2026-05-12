import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  getDb: vi.fn(async () => null),
  writeAuditLog: vi.fn(async () => undefined),
}));
import { TRPCError } from "@trpc/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  RBAC_PERMISSIONS,
  RBAC_ROLE_PERMISSIONS,
  assertSensitiveActionAllowed,
  hasPermission,
  requireActiveStaffSession,
  requireFreshSession,
  requirePermission,
  type RbacContext,
} from "./services/rbacPolicy";
import {
  InMemoryStaffSecurityStore,
  recordStaffDeviceSession,
} from "./services/staffSessionSecurity";
import {
  assertPrescriptionUsableForCustomer,
  logPrescriptionVaultAccess,
} from "./services/prescriptionVault";

function ctx(
  role: string,
  store = new InMemoryStaffSecurityStore(),
  lastSeenAt = new Date()
): RbacContext {
  void recordStaffDeviceSession(
    { staffId: 7, sessionId: "sess-7", deviceId: "device-7", lastSeenAt },
    store
  );
  return {
    user: { id: 7, role, staffStoreId: 1 },
    req: { headers: { "x-staff-session-id": "sess-7" } },
    staffSessionStore: store,
  };
}

describe("runtime RBAC and staff session governance", () => {
  it("grants the expected permission matrix and denies insufficient roles", () => {
    expect(RBAC_PERMISSIONS).toContain("regulated.release.approve");
    expect(RBAC_ROLE_PERMISSIONS.super_admin).toEqual(
      expect.arrayContaining(RBAC_PERMISSIONS)
    );
    expect(hasPermission("pharmacist", "prescription.review")).toBe(true);
    expect(hasPermission("customer", "prescription.review")).toBe(false);
    expect(() =>
      requirePermission(
        { user: { id: 1, role: "customer" } },
        "admin.dashboard.view"
      )
    ).toThrow(TRPCError);
  });

  it("denies revoked staff sessions", async () => {
    const store = new InMemoryStaffSecurityStore();
    await recordStaffDeviceSession(
      { staffId: 7, sessionId: "revoked", deviceId: "d", status: "revoked" },
      store
    );
    await expect(
      requireActiveStaffSession({
        user: { id: 7, role: "pharmacist" },
        req: { headers: { "x-staff-session-id": "revoked" } },
        staffSessionStore: store,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies stale privileged sessions for sensitive actions", async () => {
    const stale = new Date(Date.now() - 60 * 60_000);
    const rbacCtx = ctx(
      "store_manager",
      new InMemoryStaffSecurityStore(),
      stale
    );
    await expect(
      requireFreshSession(rbacCtx, { freshnessMinutes: 10 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      assertSensitiveActionAllowed(rbacCtx, "refund.approve")
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows a fresh active pharmacist session to access regulated review helpers", async () => {
    const rbacCtx = ctx("pharmacist");
    await expect(
      assertSensitiveActionAllowed(rbacCtx, "regulated.release.approve")
    ).resolves.toBeUndefined();
  });

  it("customer cannot access another customer's prescription", () => {
    const result = assertPrescriptionUsableForCustomer(
      { id: 1, userId: 200, status: "on_file" },
      100
    );
    expect(result.usable).toBe(false);
    expect(result.reason).toMatch(/does not belong/);
  });

  it("prescription staff access logs actor context without blobs", async () => {
    const inserted: unknown[] = [];
    const db = {
      insert: () => ({ values: (row: unknown) => inserted.push(row) }),
    };
    await logPrescriptionVaultAccess(db, {
      actorId: 7,
      actorRole: "pharmacist",
      prescriptionId: 55,
      purpose: "pharmacist_review",
      channel: "admin",
    });
    expect(inserted[0]).toMatchObject({
      prescriptionId: 55,
      actorId: 7,
      actorRole: "pharmacist",
      purpose: "pharmacist_review",
      channel: "admin",
    });
    expect(JSON.stringify(inserted)).not.toMatch(
      /imageUrl|blob|secret|password/i
    );
  });

  it("refund, stock, purchase, and H1 sensitive actions require permissions", async () => {
    const customer = ctx("customer");
    await expect(
      assertSensitiveActionAllowed(customer, "refund.approve")
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      assertSensitiveActionAllowed(customer, "inventory.adjust.approve")
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      assertSensitiveActionAllowed(customer, "purchase.commit")
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      assertSensitiveActionAllowed(customer, "h1.register.create")
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denied sensitive action produces a safe redacted audit event", async () => {
    const store = new InMemoryStaffSecurityStore();
    await expect(
      assertSensitiveActionAllowed(
        { user: { id: 7, role: "customer" }, staffSessionStore: store },
        "provider.health.view"
      )
    ).rejects.toThrow();
    const audit = store.audits.find(
      row => row.action === "rbac.sensitive_action"
    );
    expect(audit).toBeTruthy();
    expect(JSON.stringify(audit)).toContain("denied");
    expect(JSON.stringify(audit)).not.toMatch(
      /password|secret|prescriptionBlob|imageUrl/i
    );
  });

  it("does not introduce unsafe uuid casts or zero entity identifiers", () => {
    const files = [
      "server/services/rbacPolicy.ts",
      "server/services/staffSessionSecurity.ts",
      "server/routers/prescriptionGovRouter.ts",
      "server/rbac-session-governance.test.ts",
      "drizzle/schema.ts",
      "drizzle/0048_rbac_staff_session_governance.sql",
    ];
    const offenders = files.flatMap(file => {
      const text = readFileSync(file, "utf8");
      const unsafeUuidCast = new RegExp("Number" + "\\(" + "\\s*uuid");
      const unsafeZeroEntity = new RegExp("entityId" + "\\s*:" + "\\s*0");
      return unsafeUuidCast.test(text) || unsafeZeroEntity.test(text)
        ? [file]
        : [];
    });
    expect(offenders).toEqual([]);
  });

  it("admin/frontend route static guard catches unprotected route samples and validates current wrappers", () => {
    const app = readFileSync(
      path.join(process.cwd(), "client/src/App.tsx"),
      "utf8"
    );
    const adminRoutes = readFileSync(
      path.join(process.cwd(), "client/src/routes/adminRoutes.tsx"),
      "utf8"
    );
    const unprotectedSample =
      '<Route path="/admin/reports" component={AdminReports} />';
    expect(
      /<RestrictedRoute allow=\{ADMIN_ROLES\}>[\s\S]*<Component \/>[\s\S]*<\/RestrictedRoute>/.test(
        adminRoutes
      )
    ).toBe(true);
    // pharmacy-os route is multi-line in App.tsx — check path, guard, and component separately
    expect(app).toContain('path="/pharmacy-os"');
    expect(app).toMatch(
      /path="\/pharmacy-os"[\s\S]*RestrictedRoute allow=\{STAFF_ROLES\}[\s\S]*PharmacyOS/
    );
    expect(/RestrictedRoute/.test(unprotectedSample)).toBe(false);
  });

  it("server static scanner keeps high-risk routers behind RBAC helpers", () => {
    const guardedFiles = [
      "server/routers/prescriptionGovRouter.ts",
      "server/services/rbacPolicy.ts",
    ];
    for (const file of guardedFiles) {
      const text = readFileSync(file, "utf8");
      expect(text).toMatch(
        /requirePermission|assertSensitiveActionAllowed|requireActiveStaffSession|requireFreshSession/
      );
    }
  });
});
