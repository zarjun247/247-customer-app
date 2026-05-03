import { and, eq } from "drizzle-orm";
import { notificationEvents, notificationPreferences } from "../../drizzle/schema";
import { getDb } from "../db";

export type NotificationChannel = "in_app" | "push" | "email" | "whatsapp" | "sms";

const unsafeChannels: NotificationChannel[] = ["push", "sms"];

export function buildSafeNotificationPayload(input: { channel: NotificationChannel; title: string; body: string; sensitive?: boolean }, allowSensitive = false) {
  if (input.sensitive && unsafeChannels.includes(input.channel) && !allowSensitive) return { title: "Medication reminder", body: "You have an important pharmacy update." };
  return { title: input.title, body: input.body };
}

export async function createNotification(input: { customerId: number; channel: NotificationChannel; title: string; body: string; type?: string; sensitive?: boolean; provider?: string }) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  const pref = await getNotificationPreferences(input.customerId);
  const allowSensitive = pref.find(p => p.channel === input.channel)?.allowSensitiveContent ?? false;
  const safe = buildSafeNotificationPayload({ channel: input.channel, title: input.title, body: input.body, sensitive: input.sensitive }, allowSensitive);
  const [row] = await db.insert(notificationEvents).values({ userId: input.customerId, channel: input.channel, title: safe.title, body: safe.body, type: input.type ?? "generic", safePayloadJson: JSON.stringify(safe), provider: input.provider ?? null, status: "pending" }).$returningId();
  return { id: row.id, ...safe };
}

export async function sendNotification(id: number, isProviderConfigured: boolean) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!isProviderConfigured) {
    await db.update(notificationEvents).set({ status: "unconfigured" }).where(eq(notificationEvents.id, id));
    return { id, status: "unconfigured" as const };
  }
  await db.update(notificationEvents).set({ status: "sent", sentAt: new Date() }).where(eq(notificationEvents.id, id));
  return { id, status: "sent" as const };
}
export async function scheduleNotification(id: number, scheduledAt: Date) { const db = await getDb(); if (!db) throw new Error("DB unavailable"); await db.update(notificationEvents).set({ scheduledFor: scheduledAt }).where(eq(notificationEvents.id, id)); return { id, scheduledAt }; }
export async function markNotificationSent(id: number) { const db = await getDb(); if (!db) throw new Error("DB unavailable"); await db.update(notificationEvents).set({ status: "sent", sentAt: new Date() }).where(eq(notificationEvents.id, id)); return { id }; }
export async function markNotificationFailed(id: number, error: string) { const db = await getDb(); if (!db) throw new Error("DB unavailable"); await db.update(notificationEvents).set({ status: "failed", safePayloadJson: JSON.stringify({ error }) }).where(eq(notificationEvents.id, id)); return { id }; }
export async function getCustomerNotifications(customerId: number) { const db = await getDb(); if (!db) throw new Error("DB unavailable"); return db.select().from(notificationEvents).where(eq(notificationEvents.userId, customerId)); }
export async function getNotificationPreferences(customerId: number) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  const rows = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, customerId));
  if (rows.length) return rows;
  await db.insert(notificationPreferences).values([
    { userId: customerId, channel: "in_app", enabled: true },{ userId: customerId, channel: "push", enabled: true },{ userId: customerId, channel: "email", enabled: true },{ userId: customerId, channel: "whatsapp", enabled: true },{ userId: customerId, channel: "sms", enabled: false }
  ]);
  return db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, customerId));
}
export async function updateNotificationPreferences(customerId: number, updates: { allowSensitiveInUnsafeChannels?: boolean; channels?: Record<NotificationChannel, boolean> }) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (updates.channels) {
    for (const [channel, enabled] of Object.entries(updates.channels)) {
      await db.insert(notificationPreferences).values({ userId: customerId, channel: channel as NotificationChannel, enabled, allowSensitiveContent: updates.allowSensitiveInUnsafeChannels ?? false }).onDuplicateKeyUpdate({ set: { enabled, allowSensitiveContent: updates.allowSensitiveInUnsafeChannels ?? false } });
    }
  }
  return getNotificationPreferences(customerId);
}
