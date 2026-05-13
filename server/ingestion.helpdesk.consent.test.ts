/**
 * Tests for ingestionRouter, helpdeskRouter, and consentRouter
 *
 * These tests use the appRouter caller pattern (no real DB) to verify:
 *  - Input validation (Zod schema enforcement)
 *  - Auth guard: unauthenticated callers are rejected with UNAUTHORIZED
 *  - Procedure existence on the appRouter
 */

import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Shared context factories ─────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function makeUser(
  overrides: Partial<AuthenticatedUser> = {}
): AuthenticatedUser {
  return {
    id: 42,
    openId: "test-user-42",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

function makeCtx(user: AuthenticatedUser | null = null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
      cookie: () => {},
    } as unknown as TrpcContext["res"],
  };
}

const anonCtx = makeCtx(null);
const adminCtx = makeCtx(makeUser({ role: "admin" }));
const userCtx = makeCtx(makeUser({ role: "user" }));
const _storeManagerCtx = makeCtx(makeUser({ role: "store_manager", id: 10 }));

// ─── Ingestion Router ─────────────────────────────────────────────────────────

describe("ingestionRouter — auth guard", () => {
  it("ingestion.list rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(caller.ingestion.list({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("ingestion.upload rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(
      caller.ingestion.upload({
        filename: "test.pdf",
        mimeType: "application/pdf",
        base64Data: "dGVzdA==",
        storeId: 1,
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("ingestion.retryOcr rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(
      caller.ingestion.retryOcr({ ingestionId: 1 })
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("ingestionRouter — input validation", () => {
  it("ingestion.upload rejects invalid mimeType", async () => {
    const caller = appRouter.createCaller(adminCtx);
    await expect(
      caller.ingestion.upload({
        filename: "test.exe",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mimeType: "application/exe" as any,
        base64Data: "dGVzdA==",
        storeId: 1,
      })
    ).rejects.toThrow();
  });

  it("ingestion.upload rejects empty base64Data", async () => {
    const caller = appRouter.createCaller(adminCtx);
    await expect(
      caller.ingestion.upload({
        filename: "test.pdf",
        mimeType: "application/pdf",
        base64Data: "",
        storeId: 1,
      })
    ).rejects.toThrow();
  });

  it("ingestion.approveItem rejects missing itemId", async () => {
    const caller = appRouter.createCaller(adminCtx);
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      caller.ingestion.approveItem({ itemId: undefined as any })
    ).rejects.toThrow();
  });
});

// ─── Helpdesk Router ──────────────────────────────────────────────────────────

describe("helpdeskRouter — auth guard", () => {
  it("helpdesk.list rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(caller.helpdesk.list({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("helpdesk.create rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(
      caller.helpdesk.create({
        category: "order",
        subject: "Test subject",
        description: "Test description that is long enough",
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("helpdesk.get rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(caller.helpdesk.get({ ticketId: 1 })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("helpdeskRouter — input validation", () => {
  it("helpdesk.create rejects subject shorter than 5 chars", async () => {
    const caller = appRouter.createCaller(userCtx);
    await expect(
      caller.helpdesk.create({
        category: "order",
        subject: "Hi",
        description: "A valid description that is long enough",
      })
    ).rejects.toThrow();
  });

  it("helpdesk.create rejects description shorter than 10 chars", async () => {
    const caller = appRouter.createCaller(userCtx);
    await expect(
      caller.helpdesk.create({
        category: "order",
        subject: "Valid subject",
        description: "Short",
      })
    ).rejects.toThrow();
  });

  it("helpdesk.create rejects invalid category", async () => {
    const caller = appRouter.createCaller(userCtx);
    await expect(
      caller.helpdesk.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        category: "invalid_category" as any,
        subject: "Valid subject here",
        description: "A valid description that is long enough",
      })
    ).rejects.toThrow();
  });

  it("helpdesk.updateStatus rejects invalid status value", async () => {
    const caller = appRouter.createCaller(adminCtx);
    await expect(
      caller.helpdesk.updateStatus({
        ticketId: 1,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        status: "flying" as any,
      })
    ).rejects.toThrow();
  });
});

// ─── Consent Router ───────────────────────────────────────────────────────────

describe("consentRouter — auth guard", () => {
  it("consent.getStatus rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(caller.consent.getStatus()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("consent.grant rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(
      caller.consent.grant({ types: ["terms_of_service"] })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("consent.revoke rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(
      caller.consent.revoke({ type: "marketing" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("consent.history rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(caller.consent.history({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("consentRouter — input validation", () => {
  it("consent.grant rejects empty types array", async () => {
    const caller = appRouter.createCaller(userCtx);
    await expect(caller.consent.grant({ types: [] })).rejects.toThrow();
  });

  it("consent.grant rejects invalid consent type", async () => {
    const caller = appRouter.createCaller(userCtx);
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      caller.consent.grant({ types: ["invalid_type" as any] })
    ).rejects.toThrow();
  });

  it("consent.revoke rejects non-revocable type (terms_of_service)", async () => {
    const caller = appRouter.createCaller(userCtx);
    // terms_of_service is not in the revoke enum — should throw Zod error
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      caller.consent.revoke({ type: "terms_of_service" as any })
    ).rejects.toThrow();
  });

  it("consent.revoke rejects non-revocable type (privacy_policy)", async () => {
    const caller = appRouter.createCaller(userCtx);
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      caller.consent.revoke({ type: "privacy_policy" as any })
    ).rejects.toThrow();
  });

  it("consent.history rejects limit > 100", async () => {
    const caller = appRouter.createCaller(userCtx);
    await expect(caller.consent.history({ limit: 999 })).rejects.toThrow();
  });

  it("consent.history accepts valid limit and offset (Zod passes)", async () => {
    // Zod validation passes; DB may return empty array or error depending on env
    const caller = appRouter.createCaller(userCtx);
    // Should NOT throw a Zod validation error — either resolves or throws DB error
    const result = await caller.consent
      .history({ limit: 10, offset: 0 })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .catch((err: any) => err);
    // If it resolves, it should be an array; if it rejects, it should be a server error (not Zod)
    if (Array.isArray(result)) {
      expect(result).toBeDefined();
    } else {
      // Zod errors have code "BAD_REQUEST"; DB errors have "INTERNAL_SERVER_ERROR"
      expect(result.code).not.toBe("BAD_REQUEST");
    }
  });
});

// ─── Procedure existence smoke tests ─────────────────────────────────────────

describe("router structure — procedure existence", () => {
  it("ingestionRouter exposes expected procedures", () => {
    const caller = appRouter.createCaller(adminCtx);
    expect(typeof caller.ingestion.list).toBe("function");
    expect(typeof caller.ingestion.upload).toBe("function");
    expect(typeof caller.ingestion.get).toBe("function");
    expect(typeof caller.ingestion.getItems).toBe("function");
    expect(typeof caller.ingestion.approveItem).toBe("function");
    expect(typeof caller.ingestion.rejectItem).toBe("function");
    expect(typeof caller.ingestion.approveAll).toBe("function");
    expect(typeof caller.ingestion.retryOcr).toBe("function");
  });

  it("helpdeskRouter exposes expected procedures", () => {
    const caller = appRouter.createCaller(adminCtx);
    expect(typeof caller.helpdesk.list).toBe("function");
    expect(typeof caller.helpdesk.create).toBe("function");
    expect(typeof caller.helpdesk.get).toBe("function");
    expect(typeof caller.helpdesk.updateStatus).toBe("function");
  });

  it("consentRouter exposes expected procedures", () => {
    const caller = appRouter.createCaller(adminCtx);
    expect(typeof caller.consent.getStatus).toBe("function");
    expect(typeof caller.consent.grant).toBe("function");
    expect(typeof caller.consent.revoke).toBe("function");
    expect(typeof caller.consent.history).toBe("function");
  });
});
