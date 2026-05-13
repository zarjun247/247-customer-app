import { and, eq } from "drizzle-orm";
import { orderRatings } from "../../drizzle/schema";
import { getDb } from "../db";

export async function createOrderRating(input: {
  orderId: number;
  customerId: number;
  overall: number;
  delivery?: number;
  packaging?: number;
  pharmacistSupport?: number;
  availability?: number;
  issueTags?: string[];
  comment?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const existing = await db
    .select()
    .from(orderRatings)
    .where(
      and(
        eq(orderRatings.orderId, input.orderId),
        eq(orderRatings.userId, input.customerId)
      )
    )
    .limit(1);
  if (existing[0]) throw new Error("Rating already exists");
  const [r] = await db
    .insert(orderRatings)
    .values({
      orderId: input.orderId,
      userId: input.customerId,
      overall: input.overall,
      delivery: input.delivery ?? null,
      packaging: input.packaging ?? null,
      pharmacistSupport: input.pharmacistSupport ?? null,
      availability: input.availability ?? null,
      issueTagsJson: input.issueTags ? JSON.stringify(input.issueTags) : null,
      comment: input.comment ?? null,
    })
    .$returningId();
  return { id: r.id, ...input };
}

export type OrderRatingUpdate = {
  overall?: number;
  delivery?: number;
  packaging?: number;
  pharmacistSupport?: number;
  availability?: number;
  issueTags?: string[];
  comment?: string;
};

export async function updateOrderRating(
  orderId: number,
  customerId: number,
  updates: OrderRatingUpdate
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const { issueTags, ...rest } = updates;
  await db
    .update(orderRatings)
    .set({
      ...rest,
      issueTagsJson: issueTags ? JSON.stringify(issueTags) : undefined,
    })
    .where(
      and(
        eq(orderRatings.orderId, orderId),
        eq(orderRatings.userId, customerId)
      )
    );
  return getOrderRating(orderId, customerId);
}
export async function getOrderRating(orderId: number, customerId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const rows = await db
    .select()
    .from(orderRatings)
    .where(
      and(
        eq(orderRatings.orderId, orderId),
        eq(orderRatings.userId, customerId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}
export async function getRatingsReport() {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const rows = await db.select().from(orderRatings);
  const avg = rows.length
    ? rows.reduce((a, b) => a + Number(b.overall), 0) / rows.length
    : 0;
  return { count: rows.length, avgOverall: Number(avg.toFixed(2)), rows };
}
export function __markOrderDeliveredForTest(_orderId: number) {}
