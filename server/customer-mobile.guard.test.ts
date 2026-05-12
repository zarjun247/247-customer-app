import { describe, expect, it } from "vitest";
import { buildSafeNotificationPayload } from "./services/notificationService";
import {
  createRefillReminder,
  createReorderPrompt,
} from "./services/refillReminderService";
import fs from "node:fs";

describe("customer-mobile guardrails", () => {
  it("redacts sensitive payload for unsafe channels by default", () => {
    const p = buildSafeNotificationPayload({
      channel: "sms",
      title: "Amlodipine reminder",
      body: "Take Amlodipine",
      sensitive: true,
    });
    expect(p.body).not.toContain("Amlodipine");
  });

  it("creates reorder prompt only (no auto confirmed sale)", () => {
    const rr = createRefillReminder({
      customerId: 1,
      productId: 2,
      nextRefillDate: "2026-05-03",
      regulated: true,
    });
    const prompt = createReorderPrompt(rr.id)!;
    expect(prompt.status).toBe("draft_prompt");
    expect(prompt.requiresComplianceReview).toBe(true);
  });

  it("dosage service has no advice text path", () => {
    const txt = fs.readFileSync("server/services/dosageTracking.ts", "utf8");
    expect(txt.toLowerCase()).not.toContain("medical advice");
    expect(txt.toLowerCase()).not.toContain("dosage suggestion");
  });

  it("rating service keeps single-rating guard", () => {
    const txt = fs.readFileSync("server/services/orderRating.ts", "utf8");
    expect(txt).toContain("Rating already exists");
  });

  it("release docs include notification env sections", () => {
    const txt = fs.readFileSync(".env.example", "utf8");
    expect(txt).toContain("PUSH_PROVIDER");
  });
});
