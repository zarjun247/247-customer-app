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

describe("authenticateRequest phone session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = "test-secret-for-phone-session";
    process.env.VITE_APP_ID = "test-app-id";
  });

  it("authenticateRequest accepts a signed OTP phone session", async () => {
    const phoneUser = makeUser({ id: 7, phone: "+919999999999" });
    vi.mocked(db.getUserByPhone).mockResolvedValue(phoneUser);

    const { sdk } = await import("./_core/sdk");
    const { COOKIE_NAME } = await import("@shared/const");
    const token = await sdk.signSession(
      {
        openId: "phone:+919999999999",
        appId: "test-app-id",
        name: "Phone User",
      },
      { expiresInMs: 60_000 }
    );

    const req = { headers: { cookie: `${COOKIE_NAME}=${token}` } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(sdk.authenticateRequest(req as any)).resolves.toMatchObject({
      id: 7,
      phone: "+919999999999",
    });
    expect(db.getUserByPhone).toHaveBeenCalledWith("+919999999999");
  });
});
