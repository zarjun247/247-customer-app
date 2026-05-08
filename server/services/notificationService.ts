import { eq } from "drizzle-orm";
import { notificationEvents, notificationPreferences } from "../../drizzle/schema";
import { getDb } from "../db";
import { classifyProviderResult, normalizeProviderResult as normalizeRuntimeProviderResult } from "./providerRuntime";

export type NotificationChannel = "in_app" | "push" | "email" | "whatsapp" | "sms";
export type NotificationSendStatus =
  | "pending"
  | "sent"
  | "failed"
  | "provider_unconfigured"
  | "retry_scheduled"
  | "dead_letter"
  | "skipped_demo"
  | "demo_skipped"
  | "preview_only";

const defaultChannels: Array<{ channel: NotificationChannel; enabled: boolean }> = [
  { channel: "in_app", enabled: true },
  { channel: "push", enabled: true },
  { channel: "email", enabled: true },
  { channel: "whatsapp", enabled: true },
  { channel: "sms", enabled: false },
];

const unsafeChannels: NotificationChannel[] = ["push", "sms", "whatsapp"];

export function buildSafeNotificationPayload(
  input: { channel: NotificationChannel; title: string; body: string; sensitive?: boolean },
  allowSensitive = false,
) {
  if (input.sensitive && unsafeChannels.includes(input.channel) && !allowSensitive) {
    return { title: "Medication reminder", body: "You have an important pharmacy update." };
  }
  return { title: input.title, body: input.body };
}

export async function createNotification(input: {
  customerId: number;
  channel: NotificationChannel;
  title: string;
  body: string;
  type?: string;
  sensitive?: boolean;
  provider?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const pref = await getNotificationPreferences(input.customerId);
  const channelPref = pref.find((p) => p.channel === input.channel);
  if (channelPref && channelPref.enabled === false) {
    const [row] = await db
      .insert(notificationEvents)
      .values({
        userId: input.customerId,
        channel: input.channel,
        title: "Notification skipped",
        body: "Customer channel preference disabled.",
        type: input.type ?? "generic",
        safePayloadJson: JSON.stringify({ skipped: true, reason: "preference_disabled" }),
        provider: input.provider ?? null,
        status: "dead_letter",
      })
      .$returningId();
    return { id: row.id, title: "Notification skipped", body: "Customer channel preference disabled.", status: "dead_letter" as const };
  }
  const allowSensitive = channelPref?.allowSensitiveContent ?? false;
  const safe = buildSafeNotificationPayload(
    { channel: input.channel, title: input.title, body: input.body, sensitive: input.sensitive },
    allowSensitive,
  );
  const [row] = await db
    .insert(notificationEvents)
    .values({
      userId: input.customerId,
      channel: input.channel,
      title: safe.title,
      body: safe.body,
      type: input.type ?? "generic",
      safePayloadJson: JSON.stringify({ ...safe, sensitiveRedacted: Boolean(input.sensitive && safe.body !== input.body) }),
      provider: input.provider ?? null,
      status: "pending",
    })
    .$returningId();
  return { id: row.id, ...safe, status: "pending" as const };
}

export async function sendNotification(id: number, providerResult: boolean | { ok?: boolean; status?: NotificationSendStatus; providerMessageId?: string; error?: string } | null | undefined) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const normalized = normalizeProviderResult(providerResult);
  const update: Record<string, unknown> = { status: normalized.status };
  if (normalized.status === "sent") update.sentAt = new Date();
  if (normalized.providerMessageId) update.providerMessageId = normalized.providerMessageId;
  if (normalized.error) update.safePayloadJson = JSON.stringify({ error: normalized.error });

  await db.update(notificationEvents).set(update).where(eq(notificationEvents.id, id));
  return { id, status: normalized.status };
}

export function normalizeProviderResult(providerResult: boolean | { ok?: boolean; status?: NotificationSendStatus; providerMessageId?: string; error?: string; failureType?: string; attemptNo?: number } | null | undefined) {
  if (providerResult === true) return { status: "sent" as const };
  if (providerResult === false) return { status: "failed" as const, error: "provider_returned_false" };
  if (!providerResult) return { status: "provider_unconfigured" as const, error: "provider_unavailable" };
  if (!providerResult.status && providerResult.ok === false) return { status: "failed" as const, error: providerResult.error ?? "provider_failed" };

  const runtime = classifyProviderResult(normalizeRuntimeProviderResult(
    { ...providerResult, reason: providerResult.error },
    { provider: "notification", operation: "email.send", idempotencyKey: `notification-${providerResult.providerMessageId ?? "unknown"}`, attemptNo: providerResult.attemptNo ?? 1 },
  ));

  if (runtime.status === "success") return { status: "sent" as const, providerMessageId: providerResult.providerMessageId };
  if (runtime.status === "demo_skipped") return { status: "demo_skipped" as const, error: providerResult.error ?? runtime.reason };
  if (runtime.status === "preview_only") return { status: "preview_only" as const, error: providerResult.error ?? runtime.reason };
  if (runtime.status === "retry_scheduled") return { status: "retry_scheduled" as const, error: providerResult.error ?? runtime.reason };
  if (runtime.status === "dead_letter") return { status: "dead_letter" as const, error: providerResult.error ?? runtime.deadLetterReason ?? runtime.reason };
  if (runtime.status === "provider_unconfigured") return { status: "provider_unconfigured" as const, error: providerResult.error ?? runtime.reason };
  if (providerResult.status === "skipped_demo") return { status: "skipped_demo" as const, error: providerResult.error };
  return { status: "failed" as const, error: providerResult.error ?? runtime.reason ?? "provider_failed" };
}

export async function scheduleNotification(id: number, scheduledAt: Date) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(notificationEvents).set({ scheduledFor: scheduledAt, status: "retry_scheduled" }).where(eq(notificationEvents.id, id));
  return { id, scheduledAt, status: "retry_scheduled" as const };
}

export async function markNotificationSent(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(notificationEvents).set({ status: "sent", sentAt: new Date() }).where(eq(notificationEvents.id, id));
  return { id };
}

export async function markNotificationFailed(id: number, error: string, status: Exclude<NotificationSendStatus, "sent" | "pending"> = "failed") {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(notificationEvents).set({ status, safePayloadJson: JSON.stringify({ error }) }).where(eq(notificationEvents.id, id));
  return { id, status };
}

export async function getCustomerNotifications(customerId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db.select().from(notificationEvents).where(eq(notificationEvents.userId, customerId));
}

export async function getNotificationPreferences(customerId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  for (const pref of defaultChannels) {
    await db
      .insert(notificationPreferences)
      .values({ userId: customerId, channel: pref.channel, enabled: pref.enabled, allowSensitiveContent: false })
      .onDuplicateKeyUpdate({ set: { updatedAt: new Date() } });
  }
  return db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, customerId));
}

export async function updateNotificationPreferences(
  customerId: number,
  updates: { allowSensitiveInUnsafeChannels?: boolean; channels?: Partial<Record<NotificationChannel, boolean>> },
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await getNotificationPreferences(customerId);

  if (updates.channels) {
    for (const [channel, enabled] of Object.entries(updates.channels)) {
      const set: { enabled: boolean; allowSensitiveContent?: boolean; updatedAt: Date } = { enabled, updatedAt: new Date() };
      if (updates.allowSensitiveInUnsafeChannels !== undefined) set.allowSensitiveContent = updates.allowSensitiveInUnsafeChannels;
      await db
        .insert(notificationPreferences)
        .values({
          userId: customerId,
          channel: channel as NotificationChannel,
          enabled,
          allowSensitiveContent: updates.allowSensitiveInUnsafeChannels ?? false,
        })
        .onDuplicateKeyUpdate({ set });
    }
  }

  if (updates.allowSensitiveInUnsafeChannels !== undefined) {
    for (const channel of unsafeChannels) {
      await db
        .insert(notificationPreferences)
        .values({ userId: customerId, channel, enabled: defaultChannels.find((p) => p.channel === channel)?.enabled ?? true, allowSensitiveContent: updates.allowSensitiveInUnsafeChannels })
        .onDuplicateKeyUpdate({ set: { allowSensitiveContent: updates.allowSensitiveInUnsafeChannels, updatedAt: new Date() } });
    }
  }

  return getNotificationPreferences(customerId);
}
