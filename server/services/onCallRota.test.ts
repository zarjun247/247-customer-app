import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("fs");
vi.mock("../_core/env", () => ({
  ENV: {
    onCallPagerDutyIntegrationKey: "",
    onCallAlertEmail: "",
  },
}));

import fs from "fs";
import {
  getCurrentOnCall,
  listUpcomingShifts,
  upsertShift,
  escalate,
  type OnCallShift,
} from "./onCallRota";

function makeShift(override?: Partial<OnCallShift>): OnCallShift {
  return {
    id: "shift-1",
    role: "incident_commander",
    primaryUserId: "user-1",
    startsAt: new Date(Date.now() - 3_600_000).toISOString(),
    endsAt: new Date(Date.now() + 3_600_000).toISOString(),
    timezone: "Asia/Kolkata",
    ...override,
  };
}

function mockRota(shifts: OnCallShift[]) {
  vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ shifts }));
}

describe("getCurrentOnCall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the current active shift", async () => {
    const shift = makeShift();
    mockRota([shift]);
    const result = await getCurrentOnCall("incident_commander");
    expect(result).toEqual(shift);
  });

  it("returns null when no shifts exist", async () => {
    mockRota([]);
    const result = await getCurrentOnCall("incident_commander");
    expect(result).toBeNull();
  });

  it("returns null when shift has ended", async () => {
    const past = makeShift({
      startsAt: new Date(Date.now() - 7_200_000).toISOString(),
      endsAt: new Date(Date.now() - 3_600_000).toISOString(),
    });
    mockRota([past]);
    const result = await getCurrentOnCall("incident_commander");
    expect(result).toBeNull();
  });

  it("returns null for a different role", async () => {
    const shift = makeShift({ role: "pharmacist_in_charge" });
    mockRota([shift]);
    const result = await getCurrentOnCall("incident_commander");
    expect(result).toBeNull();
  });
});

describe("listUpcomingShifts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns shifts within the day window", async () => {
    const current = makeShift();
    const future = makeShift({
      id: "shift-2",
      startsAt: new Date(Date.now() + 86_400_000).toISOString(),
      endsAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    });
    mockRota([current, future]);
    const result = await listUpcomingShifts("incident_commander", 7);
    expect(result).toHaveLength(2);
  });

  it("excludes shifts beyond the day window", async () => {
    const farFuture = makeShift({
      id: "shift-far",
      startsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      endsAt: new Date(Date.now() + 31 * 86_400_000).toISOString(),
    });
    mockRota([farFuture]);
    const result = await listUpcomingShifts("incident_commander", 7);
    expect(result).toHaveLength(0);
  });
});

describe("upsertShift", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds a new shift when id not found", async () => {
    mockRota([]);
    const writeSpy = vi.mocked(fs.writeFileSync);
    const shift = makeShift({ id: "new-shift" });
    await upsertShift(shift);
    expect(writeSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("new-shift"),
      "utf-8",
    );
  });

  it("updates existing shift when id matches", async () => {
    const existing = makeShift({ primaryUserId: "user-old" });
    mockRota([existing]);
    const writeSpy = vi.mocked(fs.writeFileSync);
    const updated = makeShift({ primaryUserId: "user-new" });
    await upsertShift(updated);
    const written = writeSpy.mock.calls[0][1] as string;
    expect(written).toContain("user-new");
    expect(written).not.toContain("user-old");
  });
});

describe("escalate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRota([]);
  });

  it("resolves without throwing when no PagerDuty key is configured", async () => {
    await expect(
      escalate("P1", "incident_commander", { deadLetterId: 42 }),
    ).resolves.toBeUndefined();
  });

  it("resolves without throwing even with a PagerDuty key (fetch mocked)", async () => {
    vi.mock("../_core/env", () => ({
      ENV: { onCallPagerDutyIntegrationKey: "test-key", onCallAlertEmail: "" },
    }));
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
    } as Response);
    await expect(
      escalate("P0", "platform_owner", { reason: "test" }),
    ).resolves.toBeUndefined();
    fetchSpy.mockRestore();
  });
});
