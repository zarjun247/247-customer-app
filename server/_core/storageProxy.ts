/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import type { Express } from "express";
import { ENV } from "./env";
import {
  canAccessStorageKey,
  assertSafeStorageKey,
  isSensitiveStorageKey,
} from "./storageAccess";
import { sdk } from "./sdk";

export function registerStorageProxy(app: Express) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.get("/manus-storage/*", (req: any, res) => {
    void (async () => {
      const key: string = req.params["0"] ?? "";
      if (!key) return void res.status(400).send("Missing storage key");
      try {
        assertSafeStorageKey(key);
      } catch {
        return void res.status(400).send("Invalid storage key");
      }

      const user = await sdk.authenticateRequest(req);
      if (!canAccessStorageKey(user, key))
        return void res.status(403).send("Forbidden");

      if (!ENV.forgeApiUrl || !ENV.forgeApiKey)
        return void res.status(500).send("Storage proxy not configured");

      try {
        const forgeUrl = new URL(
          "v1/storage/presign/get",
          ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
        );
        forgeUrl.searchParams.set("path", key);
        const forgeResp = await fetch(forgeUrl, {
          headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
        });
        if (!forgeResp.ok)
          return void res.status(502).send("Storage backend error");
        const { url } = (await forgeResp.json()) as { url: string };
        if (!url)
          return void res.status(502).send("Empty signed URL from backend");
        res.set(
          "Cache-Control",
          isSensitiveStorageKey(key) ? "no-store" : "public, max-age=300"
        );
        res.redirect(307, url);
      } catch {
        res.status(502).send("Storage proxy error");
      }
    })();
  });
}
