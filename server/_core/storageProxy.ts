import type { Express } from "express";
import { ENV } from "./env";
import { canAccessStorageKey, assertSafeStorageKey, isSensitiveStorageKey } from "./storageAccess";

export function registerStorageProxy(app: Express) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.get("/manus-storage/*", async (req: any, res) => {
    const key: string = req.params["0"] ?? "";
    if (!key) return void res.status(400).send("Missing storage key");
    try { assertSafeStorageKey(key); } catch { return void res.status(400).send("Invalid storage key"); }

    const authHeader = req.headers.authorization as string | undefined;
    const hasBearer = Boolean(authHeader?.startsWith("Bearer "));
    if (!canAccessStorageKey(hasBearer ? { id: 0, role: "admin" } : null, key)) return void res.status(403).send("Forbidden");

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) return void res.status(500).send("Storage proxy not configured");

    try {
      const forgeUrl = new URL("v1/storage/presign/get", ENV.forgeApiUrl.replace(/\/+$/, "") + "/");
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, { headers: { Authorization: `Bearer ${ENV.forgeApiKey}` } });
      if (!forgeResp.ok) return void res.status(502).send("Storage backend error");
      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) return void res.status(502).send("Empty signed URL from backend");
      res.set("Cache-Control", isSensitiveStorageKey(key) ? "no-store" : "public, max-age=300");
      res.redirect(307, url);
    } catch {
      res.status(502).send("Storage proxy error");
    }
  });
}
