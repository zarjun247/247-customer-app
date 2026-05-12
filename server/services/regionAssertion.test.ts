import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  assertIndiaRegionStorage,
  RegionAssertionError,
} from "./regionAssertion";

const ORIG_ENV = { ...process.env };

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

beforeEach(() => {
  setEnv({
    DPDP_REGION_REQUIRED: undefined,
    DATABASE_URL: undefined,
    STORAGE_BUCKET_NAME: undefined,
  });
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIG_ENV)) delete process.env[key];
    else process.env[key] = ORIG_ENV[key];
  }
});

describe("assertIndiaRegionStorage", () => {
  it("returns silently when DPDP_REGION_REQUIRED is unset", async () => {
    await expect(assertIndiaRegionStorage()).resolves.toBeUndefined();
  });

  it("returns silently when DPDP_REGION_REQUIRED is empty string", async () => {
    setEnv({ DPDP_REGION_REQUIRED: "" });
    await expect(assertIndiaRegionStorage()).resolves.toBeUndefined();
  });

  it("throws RegionAssertionError for unrecognised region", async () => {
    setEnv({ DPDP_REGION_REQUIRED: "us-east-1" });
    await expect(assertIndiaRegionStorage()).rejects.toBeInstanceOf(
      RegionAssertionError
    );
  });

  it("throws RegionAssertionError for clearly wrong region", async () => {
    setEnv({ DPDP_REGION_REQUIRED: "eu-west-1" });
    await expect(assertIndiaRegionStorage()).rejects.toThrow(
      /not a recognised India AWS region/
    );
  });

  it("passes for ap-south-1 with no bucket configured", async () => {
    setEnv({ DPDP_REGION_REQUIRED: "ap-south-1", STORAGE_BUCKET_NAME: "" });
    // Should not throw (no bucket to check)
    await expect(assertIndiaRegionStorage()).resolves.toBeUndefined();
  });

  it("passes for ap-south-2", async () => {
    setEnv({ DPDP_REGION_REQUIRED: "ap-south-2", DATABASE_URL: "" });
    await expect(assertIndiaRegionStorage()).resolves.toBeUndefined();
  });

  it("throws for RDS endpoint in wrong region", async () => {
    setEnv({
      DPDP_REGION_REQUIRED: "ap-south-1",
      DATABASE_URL:
        "mysql://user:pass@mydb.us-east-1.rds.amazonaws.com:3306/pharmacy",
    });
    await expect(assertIndiaRegionStorage()).rejects.toThrow(
      /region "us-east-1"/
    );
  });

  it("passes for RDS endpoint in correct region", async () => {
    setEnv({
      DPDP_REGION_REQUIRED: "ap-south-1",
      DATABASE_URL:
        "mysql://user:pass@mydb.ap-south-1.rds.amazonaws.com:3306/pharmacy",
    });
    await expect(assertIndiaRegionStorage()).resolves.toBeUndefined();
  });
});
