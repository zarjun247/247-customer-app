import { describe, it, expect, vi, beforeEach } from "vitest";

const selectRows = vi.fn();
const insertValues = vi.fn();

vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => selectRows(),
        }),
      }),
    }),
    insert: () => ({
      values: insertValues,
    }),
  })),
}));

import {
  recordDoseTaken,
  recordDoseSkipped,
  getAdherenceSummary,
  estimateMedicationRemaining,
  estimateRunoutDate,
} from "./services/dosageTracking";

describe("dosage schedule ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectRows.mockResolvedValue([{ id: 99, userId: 2, scheduleJson: JSON.stringify({ unitsPerDay: 1, totalUnits: 10 }) }]);
  });

  it("rejects guessed scheduleId mutations and reads for another customer", async () => {
    await expect(recordDoseTaken(1, "99", "2026-05-07")).resolves.toBe(false);
    await expect(recordDoseSkipped(1, "99", "2026-05-07")).resolves.toBe(false);
    await expect(getAdherenceSummary(1, "99")).resolves.toEqual({ taken: 0, skipped: 0, adherencePct: 0 });
    await expect(estimateMedicationRemaining(1, "99")).resolves.toBeNull();
    await expect(estimateRunoutDate(1, "99", "2026-05-07")).resolves.toBeNull();
    expect(insertValues).not.toHaveBeenCalled();
  });
});
