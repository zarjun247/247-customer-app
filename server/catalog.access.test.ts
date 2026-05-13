/**
 * catalog.access.test.ts
 *
 * Verifies that catalog.list and catalog.store throw ONBOARDING_REQUIRED
 * (PRECONDITION_FAILED) for users who have not completed onboarding,
 * and that they return data for users who have.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ONBOARDING_REQUIRED_MSG } from "@shared/const";

// ── Minimal mock of db helpers ─────────────────────────────────────────────────
const mockGetUserById = vi.fn();
const mockGetCatalog = vi.fn();
const mockGetStoreById = vi.fn();

vi.mock("./db", () => ({
  getUserById: (...args: unknown[]) => mockGetUserById(...args),
  getCatalog: (...args: unknown[]) => mockGetCatalog(...args),
  getStoreById: (...args: unknown[]) => mockGetStoreById(...args),
  getBuildings: vi.fn().mockResolvedValue([]),
  getBuildingById: vi.fn().mockResolvedValue(null),
  updateUserProfile: vi.fn().mockResolvedValue(undefined),
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  getCart: vi.fn().mockResolvedValue([]),
  upsertCartItem: vi.fn().mockResolvedValue(undefined),
  clearCart: vi.fn().mockResolvedValue(undefined),
  softLockCart: vi.fn().mockResolvedValue([]),
  applySoftLockToSkus: vi.fn().mockResolvedValue(undefined),
  releaseSoftLock: vi.fn().mockResolvedValue(undefined),
  createOrder: vi.fn().mockResolvedValue(1),
  getOrdersByUser: vi.fn().mockResolvedValue([]),
  getOrderById: vi.fn().mockResolvedValue(null),
  getOrderItems: vi.fn().mockResolvedValue([]),
  updateOrderStatus: vi.fn().mockResolvedValue(undefined),
  updateOrderInvoice: vi.fn().mockResolvedValue(undefined),
  createPrescription: vi.fn().mockResolvedValue(1),
  getPrescriptionsByUser: vi.fn().mockResolvedValue([]),
  getPrescriptionById: vi.fn().mockResolvedValue(null),
  getRefillReminders: vi.fn().mockResolvedValue([]),
  dismissRefillReminder: vi.fn().mockResolvedValue(undefined),
  upsertRefillReminder: vi.fn().mockResolvedValue(undefined),
  createOtp: vi.fn().mockResolvedValue(undefined),
  verifyOtp: vi.fn().mockResolvedValue(null),
  getWhatsappSession: vi.fn().mockResolvedValue(null),
  upsertWhatsappSession: vi.fn().mockResolvedValue(undefined),
  computeRefillIntervalFromHistory: vi.fn().mockResolvedValue(null),
  getOrderItemsForReorder: vi.fn().mockResolvedValue([]),
  createWhatsappPrescription: vi.fn().mockResolvedValue(1),
  generateAndStoreInvoice: vi.fn().mockResolvedValue(null),
  getSkuById: vi.fn().mockResolvedValue(null),
}));

vi.mock("./routing", () => ({
  resolveStore: vi.fn().mockResolvedValue({ storeId: 1 }),
  formatRoutingAuditEntry: vi.fn().mockReturnValue(""),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "k", url: "/manus-storage/k" }),
}));

vi.mock("./_core/env", () => ({
  ENV: { googleMapsApiKey: undefined, nodeEnv: "test" },
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi
    .fn()
    .mockResolvedValue({ choices: [{ message: { content: "{}" } }] }),
}));

vi.mock("./_core/voiceTranscription", () => ({
  transcribeAudio: vi.fn().mockResolvedValue({ text: "" }),
}));

vi.mock("./_core/imageGeneration", () => ({
  generateImage: vi.fn().mockResolvedValue({ url: "" }),
}));

// ── Import after mocks ─────────────────────────────────────────────────────────
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function makeCtx(userId: number): TrpcContext {
  const user: NonNullable<TrpcContext["user"]> = {
    id: userId,
    openId: `test-user-${userId}`,
    email: "test@example.com",
    name: "Test User",
    loginMethod: "otp",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────
describe("catalog.list — onboarding guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCatalog.mockResolvedValue([]);
    mockGetStoreById.mockResolvedValue({ id: 1, name: "Test Pharmacy" });
  });

  it("throws PRECONDITION_FAILED with ONBOARDING_REQUIRED when user has no assignedStoreId", async () => {
    mockGetUserById.mockResolvedValue({
      id: 1,
      onboardingComplete: false,
      assignedStoreId: null,
      buildingId: null,
    });

    const caller = appRouter.createCaller(makeCtx(1));
    await expect(
      caller.catalog.list({ search: "", category: "all", limit: 10, offset: 0 })
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: ONBOARDING_REQUIRED_MSG,
    });
  });

  it("throws PRECONDITION_FAILED with ONBOARDING_REQUIRED when onboardingComplete=false even if assignedStoreId exists", async () => {
    mockGetUserById.mockResolvedValue({
      id: 1,
      onboardingComplete: false,
      assignedStoreId: 5,
      buildingId: 2,
    });

    const caller = appRouter.createCaller(makeCtx(1));
    await expect(
      caller.catalog.list({ search: "", category: "all", limit: 10, offset: 0 })
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: ONBOARDING_REQUIRED_MSG,
    });
  });

  it("returns catalog items when user has completed onboarding", async () => {
    const mockItems = [{ skuId: 1, name: "Paracetamol", sellingPrice: "10" }];
    mockGetUserById.mockResolvedValue({
      id: 1,
      onboardingComplete: true,
      assignedStoreId: 5,
      buildingId: 2,
    });
    mockGetCatalog.mockResolvedValue(mockItems);

    const caller = appRouter.createCaller(makeCtx(1));
    const result = await caller.catalog.list({
      search: "",
      category: "all",
      limit: 10,
      offset: 0,
    });
    expect(result).toEqual(mockItems);
  });
});

describe("catalog.store — onboarding guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStoreById.mockResolvedValue({ id: 1, name: "Test Pharmacy" });
  });

  it("throws PRECONDITION_FAILED with ONBOARDING_REQUIRED when user has not completed onboarding", async () => {
    mockGetUserById.mockResolvedValue({
      id: 1,
      onboardingComplete: false,
      assignedStoreId: null,
      buildingId: null,
    });

    const caller = appRouter.createCaller(makeCtx(1));
    await expect(caller.catalog.store()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: ONBOARDING_REQUIRED_MSG,
    });
  });

  it("returns store data when user has completed onboarding", async () => {
    mockGetUserById.mockResolvedValue({
      id: 1,
      onboardingComplete: true,
      assignedStoreId: 5,
      buildingId: 2,
    });
    mockGetStoreById.mockResolvedValue({ id: 5, name: "Tower Pharmacy" });

    const caller = appRouter.createCaller(makeCtx(1));
    const result = await caller.catalog.store();
    expect(result).toMatchObject({ id: 5, name: "Tower Pharmacy" });
  });
});
