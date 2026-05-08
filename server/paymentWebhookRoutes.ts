import type { Express, Request, Response } from "express";
import { TRPCError } from "@trpc/server";
import { handleRazorpayWebhook } from "./services/paymentWebhookLifecycle";
import { redactSensitive } from "./_core/redact";

function rawBodyFromRequest(req: Request): Buffer | string | null {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return req.body;
  return null;
}

function statusForError(error: unknown) {
  if (error instanceof TRPCError) {
    if (error.code === "UNAUTHORIZED") return 401;
    if (error.code === "PRECONDITION_FAILED") return 412;
    if (error.code === "BAD_REQUEST") return 400;
    if (error.code === "NOT_FOUND") return 404;
  }
  return 500;
}

export function registerPaymentWebhookRoutes(app: Express) {
  app.post("/api/webhooks/razorpay", async (req: Request, res: Response) => {
    try {
      const result = await handleRazorpayWebhook({
        rawBody: rawBodyFromRequest(req),
        signature: req.header("x-razorpay-signature") ?? req.header("x-webhook-signature") ?? null,
      });
      res.status(200).json({ ok: result.ok, status: result.status, idempotent: result.idempotent === true });
    } catch (error) {
      console.warn("payment_webhook_rejected", redactSensitive(error instanceof Error ? error.message : String(error)));
      res.status(statusForError(error)).json({ ok: false, error: "payment_webhook_rejected" });
    }
  });
}
