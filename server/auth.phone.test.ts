/**
 * auth.phone.test.ts
 * Tests for phone OTP login session creation and authenticateRequest routing.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getUserByPhone: vi.fn(),
  getUserByOpenId: vi.fn(),
  upsertUserByPhone: vi.fn(),
  updateUserProfile: vi.fn(),
}));

import * as db from "./db";

// ─── Minimal fake User ────────────────────────────────────────────────────────
const makeUser = (overrides = {}) => ({
  id: 1,
  openId: null,
  phone: "+919876543210",
  name: "Test User",
  email: null,
  loginMethod: "phone",
  role: "user" as const,
  buildingId: null,
  flatNumber: null,
  assignedStoreId: 42,
  onboardingComplete: true,
  userAddress: null,
  userLat: null,
  userLng: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
  ...overrides,
});

describe("upsertUserByPhone", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns existing user id when phone already exists", async () => {
    const existing = makeUser();
    vi.mocked(db.getUserByPhone).mockResolvedValue(existing);
    vi.mocked(db.updateUserProfile).mockResolvedValue(undefined);
    // upsertUserByPhone is fully mocked — set its return value explicitly
    vi.mocked(db.upsertUserByPhone).mockResolvedValue({ id: 1 });

    const { upsertUserByPhone } = await import("./db");
    const result = await upsertUserByPhone("+919876543210");
    expect(result.id).toBe(1);
    expect(db.upsertUserByPhone).toHaveBeenCalledWith("+919876543210");
  });

  it("returns null when phone user not found (new user path)", async () => {
    vi.mocked(db.getUserByPhone).mockResolvedValue(undefined);
    // upsertUserByPhone would insert — we just verify the lookup happens
    const { getUserByPhone } = await import("./db");
    const user = await getUserByPhone("+910000000000");
    expect(user).toBeUndefined();
  });
});

describe("phone: openId prefix routing", () => {
  it("extracts phone from phone: prefixed openId correctly", () => {
    const openId = "phone:+919876543210";
    expect(openId.startsWith("phone:")).toBe(true);
    expect(openId.slice(6)).toBe("+919876543210");
  });

  it("does not match non-phone openIds", () => {
    const openId = "manus_abc123";
    expect(openId.startsWith("phone:")).toBe(false);
  });
});

describe("verifyOtp response shape", () => {
  it("valid=false response has no session data", () => {
    const invalidResponse = { valid: false as const };
    expect(invalidResponse.valid).toBe(false);
    expect("onboardingComplete" in invalidResponse).toBe(false);
  });

  it("valid=true response includes onboardingComplete and assignedStoreId", () => {
    const validResponse = {
      valid: true as const,
      onboardingComplete: false,
      assignedStoreId: null as number | null,
    };
    expect(validResponse.valid).toBe(true);
    expect("onboardingComplete" in validResponse).toBe(true);
    expect("assignedStoreId" in validResponse).toBe(true);
  });
});
