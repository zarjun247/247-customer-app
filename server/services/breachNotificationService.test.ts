import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateBreachNotification } from "./breachNotificationService";

vi.mock("../_core/env", () => ({
  ENV: { dpoEmail: "dpo@example.com" },
}));

vi.mock("pino", () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const BASE_INPUT = {
  incidentId: "INC-2025-001",
  affectedCustomerCount: 500,
  dataCategories: ["pii", "rx_data"],
  detectedAt: new Date("2025-06-01T12:00:00Z"),
  rootCause: "SQL injection via unsanitised query parameter",
  mitigationActions: [
    "Patched vulnerable endpoint",
    "Rotated database credentials",
    "Invalidated all active sessions",
  ],
};

describe("generateBreachNotification", () => {
  it("returns a deadline 72 hours after detectedAt", async () => {
    const result = await generateBreachNotification(BASE_INPUT);
    const expectedDeadline = new Date("2025-06-04T12:00:00Z");
    expect(result.deadline.getTime()).toBe(expectedDeadline.getTime());
  });

  it("includes the incident ID in notification text", async () => {
    const result = await generateBreachNotification(BASE_INPUT);
    expect(result.notificationText).toContain("INC-2025-001");
  });

  it("includes affected count in notification text", async () => {
    const result = await generateBreachNotification(BASE_INPUT);
    expect(result.notificationText).toContain("500");
  });

  it("includes data categories in notification text", async () => {
    const result = await generateBreachNotification(BASE_INPUT);
    expect(result.notificationText).toContain("pii");
    expect(result.notificationText).toContain("rx_data");
  });

  it("includes root cause in notification text", async () => {
    const result = await generateBreachNotification(BASE_INPUT);
    expect(result.notificationText).toContain("SQL injection");
  });

  it("includes mitigation actions", async () => {
    const result = await generateBreachNotification(BASE_INPUT);
    expect(result.notificationText).toContain("Patched vulnerable endpoint");
  });

  it("includes CERT-In and DPDP references", async () => {
    const result = await generateBreachNotification(BASE_INPUT);
    expect(result.notificationText).toContain("CERT-In");
    expect(result.notificationText).toContain("DPDP");
  });

  it("includes DPO email in recipients", async () => {
    const result = await generateBreachNotification(BASE_INPUT);
    expect(result.recipients).toContain("dpo@example.com");
  });

  it("includes CERT-In as recipient", async () => {
    const result = await generateBreachNotification(BASE_INPUT);
    expect(result.recipients).toContain("cert-in@cert-in.org.in");
  });

  it("shows ONGOING when containedAt is not provided", async () => {
    const result = await generateBreachNotification(BASE_INPUT);
    expect(result.notificationText).toContain("ONGOING");
  });

  it("shows containment time when containedAt is provided", async () => {
    const result = await generateBreachNotification({
      ...BASE_INPUT,
      containedAt: new Date("2025-06-01T18:00:00Z"),
    });
    expect(result.notificationText).toContain("2025-06-01");
    expect(result.notificationText).not.toContain("ONGOING");
  });
});
