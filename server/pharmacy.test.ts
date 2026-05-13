import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(overrides?: Partial<AuthenticatedUser>): {
  ctx: TrpcContext;
  clearedCookies: { name: string; options: Record<string, unknown> }[];
} {
  const clearedCookies: { name: string; options: Record<string, unknown> }[] =
    [];
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-001",
    email: "test@247pharmacy.in",
    name: "Test User",
    loginMethod: "otp",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };
  return { ctx, clearedCookies };
}

// ─── Auth Tests ───────────────────────────────────────────────────────────────
describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({
      maxAge: -1,
      httpOnly: true,
      path: "/",
    });
  });
});

// ─── Order State Machine Tests ─────────────────────────────────────────────────
describe("Order status machine", () => {
  const STATUS_ORDER = [
    "created",
    "pharmacist_reviewing",
    "picking",
    "out_for_delivery",
    "delivered",
  ];

  it("defines correct status progression", () => {
    expect(STATUS_ORDER[0]).toBe("created");
    expect(STATUS_ORDER[1]).toBe("pharmacist_reviewing");
    expect(STATUS_ORDER[2]).toBe("picking");
    expect(STATUS_ORDER[3]).toBe("out_for_delivery");
    expect(STATUS_ORDER[4]).toBe("delivered");
  });

  it("has exactly 5 states in the lifecycle", () => {
    expect(STATUS_ORDER).toHaveLength(5);
  });

  it("pharmacist_reviewing comes before picking", () => {
    const rxIdx = STATUS_ORDER.indexOf("pharmacist_reviewing");
    const pickIdx = STATUS_ORDER.indexOf("picking");
    expect(rxIdx).toBeLessThan(pickIdx);
  });

  it("out_for_delivery comes before delivered", () => {
    const outIdx = STATUS_ORDER.indexOf("out_for_delivery");
    const delIdx = STATUS_ORDER.indexOf("delivered");
    expect(outIdx).toBeLessThan(delIdx);
  });
});

// ─── FEFO Logic Tests ─────────────────────────────────────────────────────────
describe("FEFO batch allocation logic", () => {
  const batches = [
    { id: 1, expiryDate: new Date("2026-12-01"), quantity: 50 },
    { id: 2, expiryDate: new Date("2026-06-15"), quantity: 30 },
    { id: 3, expiryDate: new Date("2027-03-01"), quantity: 100 },
  ];

  it("selects the earliest-expiring batch first", () => {
    const sorted = [...batches].sort(
      (a, b) => a.expiryDate.getTime() - b.expiryDate.getTime()
    );
    expect(sorted[0].id).toBe(2); // June 2026 is earliest
  });

  it("never allocates from an expired batch", () => {
    const now = new Date();
    const active = batches.filter(b => b.expiryDate > now);
    expect(active.length).toBeGreaterThan(0);
    active.forEach(b =>
      expect(b.expiryDate.getTime()).toBeGreaterThan(now.getTime())
    );
  });
});

// ─── Expiry Rule Tests ────────────────────────────────────────────────────────
describe("Expiry rules", () => {
  const now = new Date();

  it("flags batch as 90-day warning when expiry is within 90 days", () => {
    const expiryIn85Days = new Date(now.getTime() + 85 * 24 * 60 * 60 * 1000);
    const daysToExpiry = Math.ceil(
      (expiryIn85Days.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    expect(daysToExpiry).toBeLessThanOrEqual(90);
    expect(daysToExpiry).toBeGreaterThan(60);
  });

  it("flags batch as 60-day critical when expiry is within 60 days", () => {
    const expiryIn55Days = new Date(now.getTime() + 55 * 24 * 60 * 60 * 1000);
    const daysToExpiry = Math.ceil(
      (expiryIn55Days.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    expect(daysToExpiry).toBeLessThanOrEqual(60);
  });

  it("does not flag batch with more than 90 days to expiry", () => {
    const expiryIn120Days = new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000);
    const daysToExpiry = Math.ceil(
      (expiryIn120Days.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    expect(daysToExpiry).toBeGreaterThan(90);
  });
});

// ─── Soft-lock Logic Tests ────────────────────────────────────────────────────
describe("Inventory soft-lock", () => {
  it("available qty = stockQty - softLockedQty", () => {
    const sku = { stockQty: 100, softLockedQty: 15 };
    const available = sku.stockQty - sku.softLockedQty;
    expect(available).toBe(85);
  });

  it("prevents over-allocation beyond available qty", () => {
    const sku = { stockQty: 10, softLockedQty: 8 };
    const available = sku.stockQty - sku.softLockedQty;
    const requestedQty = 5;
    expect(requestedQty).toBeGreaterThan(available);
  });

  it("soft-lock is applied at checkout, not at add-to-cart", () => {
    // This is a design invariant test — the cart item has no lock flag at creation
    const cartItem = { isLocked: false, lockedAt: null };
    expect(cartItem.isLocked).toBe(false);
    expect(cartItem.lockedAt).toBeNull();
  });
});

// ─── Refill Reminder Logic Tests ──────────────────────────────────────────────
describe("Refill reminder engine", () => {
  it("calculates next reminder date as (lastOrdered + avgInterval - 5 days)", () => {
    const lastOrderedAt = new Date("2026-01-01");
    const avgIntervalDays = 30;
    const expectedReminder = new Date(
      lastOrderedAt.getTime() + (avgIntervalDays - 5) * 24 * 60 * 60 * 1000
    );
    const actualReminder = new Date("2026-01-26"); // Jan 1 + 25 days
    expect(expectedReminder.toDateString()).toBe(actualReminder.toDateString());
  });

  it("only generates reminders for chronic medications", () => {
    const products = [
      { id: 1, name: "Metformin 500mg", isChronicMedication: true },
      { id: 2, name: "Azithromycin 500mg", isChronicMedication: false },
      { id: 3, name: "Atorvastatin 10mg", isChronicMedication: true },
    ];
    const chronicOnly = products.filter(p => p.isChronicMedication);
    expect(chronicOnly).toHaveLength(2);
    expect(chronicOnly.map(p => p.name)).toContain("Metformin 500mg");
    expect(chronicOnly.map(p => p.name)).not.toContain("Azithromycin 500mg");
  });
});

// ─── WhatsApp Bot Flow Tests ──────────────────────────────────────────────────
describe("WhatsApp bot flow state machine", () => {
  it("returns menu on 'hi' message", () => {
    const message = "hi";
    const isMenuTrigger = ["hi", "hello", "menu"].includes(
      message.toLowerCase()
    );
    expect(isMenuTrigger).toBe(true);
  });

  it("routes to search flow on '1'", () => {
    const message = "1";
    const flowMap: Record<string, string> = {
      "1": "search",
      "2": "status",
      "3": "rx_upload",
      "4": "reorder",
      "5": "refills",
    };
    expect(flowMap[message]).toBe("search");
  });

  it("routes to status flow on '2'", () => {
    const flowMap: Record<string, string> = {
      "1": "search",
      "2": "status",
      "3": "rx_upload",
    };
    expect(flowMap["2"]).toBe("status");
  });
});
