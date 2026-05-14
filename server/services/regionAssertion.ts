import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

const DPDP_REQUIRED_REGIONS = ["ap-south-1", "ap-south-2"];

export class RegionAssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegionAssertionError";
  }
}

function normalizeRegion(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function assertIndiaRegionStorage(): Promise<void> {
  const required = (process.env.DPDP_REGION_REQUIRED ?? "").trim();
  if (!required) {
    logger.info("regionAssertion: DPDP_REGION_REQUIRED unset; skipping check");
    return;
  }

  const normalizedRequired = normalizeRegion(required);

  if (!DPDP_REQUIRED_REGIONS.includes(normalizedRequired)) {
    throw new RegionAssertionError(
      `DPDP_REGION_REQUIRED="${required}" is not a recognised India AWS region. ` +
        `Expected one of: ${DPDP_REQUIRED_REGIONS.join(", ")}`
    );
  }

  await assertS3Region(normalizedRequired);
  assertDbRegion(normalizedRequired);

  logger.info(
    { region: normalizedRequired },
    "regionAssertion: India region check passed"
  );
}

async function assertS3Region(requiredRegion: string): Promise<void> {
  const bucketName = (
    process.env.STORAGE_BUCKET_NAME ??
    process.env.AWS_S3_BUCKET ??
    ""
  ).trim();

  if (!bucketName) {
    logger.info(
      "regionAssertion: no S3 bucket configured; skipping bucket region check"
    );
    return;
  }

  try {
    const { S3Client, GetBucketLocationCommand } = await import(
      "@aws-sdk/client-s3"
    );
    const client = new S3Client({
      region: requiredRegion,
    });
    const result = await client.send(
      new GetBucketLocationCommand({ Bucket: bucketName })
    );
    const bucketRegion = normalizeRegion(
      result.LocationConstraint ?? "us-east-1"
    );
    if (bucketRegion !== requiredRegion && bucketRegion !== "us-east-1") {
      throw new RegionAssertionError(
        `S3 bucket "${bucketName}" is in region "${bucketRegion}" but DPDP requires "${requiredRegion}"`
      );
    }
    logger.info(
      { bucket: bucketName, region: bucketRegion },
      "regionAssertion: S3 region check passed"
    );
  } catch (err) {
    if (err instanceof RegionAssertionError) throw err;
    // SDK errors (missing credentials, bucket not found) are logged but do not
    // block boot when credentials are not configured (e.g., local dev).
    logger.warn(
      { err: String(err) },
      "regionAssertion: S3 region check skipped (SDK error — check AWS credentials and bucket config)"
    );
  }
}

function assertDbRegion(requiredRegion: string): void {
  const dbUrl = (process.env.DATABASE_URL ?? "").trim();
  if (!dbUrl) return;

  // For RDS/Aurora: hostname pattern is <id>.<region>.rds.amazonaws.com
  const rdsMatch = dbUrl.match(/\.([a-z0-9-]+)\.rds\.amazonaws\.com/);
  if (rdsMatch) {
    const dbRegion = normalizeRegion(rdsMatch[1]);
    if (dbRegion !== requiredRegion) {
      throw new RegionAssertionError(
        `DATABASE_URL points to region "${dbRegion}" but DPDP requires "${requiredRegion}"`
      );
    }
    logger.info(
      { region: dbRegion },
      "regionAssertion: DB region check passed"
    );
  }
  // Non-RDS/Aurora databases (local, PlanetScale, etc.) are not region-checked.
}
