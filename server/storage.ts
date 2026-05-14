// Preconfigured storage helpers for Manus WebDev templates
// Uploads via Forge Server presigned URL to S3 (PUT direct).
// Downloads return /manus-storage/{key} paths served via 307 redirect.

import { ENV } from "./_core/env";
import { makeCircuitBreaker } from "./_core/circuitBreaker";

const _storagePresign = makeCircuitBreaker(
  "storage.presign",
  async (signal: AbortSignal, url: URL, forgeKey: string) => {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${forgeKey}` },
      signal,
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => res.statusText);
      throw new Error(`Storage presign failed (${res.status}): ${msg}`);
    }
    return (await res.json()) as { url: string };
  },
  { timeoutMs: 10_000 }
);

const _storageUpload = makeCircuitBreaker(
  "storage.upload",
  async (
    signal: AbortSignal,
    s3Url: string,
    blob: Blob,
    contentType: string
  ) => {
    const res = await fetch(s3Url, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: blob,
      signal,
    });
    if (!res.ok) throw new Error(`Storage upload to S3 failed (${res.status})`);
  },
  { timeoutMs: 10_000 }
);

function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;

  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }

  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = appendHashSuffix(normalizeKey(relKey));

  // 1. Get presigned PUT URL from Forge
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);

  const { url: s3Url } = await _storagePresign(presignUrl, forgeKey);
  if (!s3Url) throw new Error("Forge returned empty presign URL");

  // 2. PUT file directly to S3
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as BlobPart], { type: contentType });

  await _storageUpload(s3Url, blob, contentType);

  return { key, url: `/manus-storage/${key}` };
}

export function storageGet(
  relKey: string
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return Promise.resolve({ key, url: `/manus-storage/${key}` });
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = normalizeKey(relKey);

  const getUrl = new URL("v1/storage/presign/get", forgeUrl + "/");
  getUrl.searchParams.set("path", key);

  const { url } = await _storagePresign(getUrl, forgeKey);
  return url;
}
