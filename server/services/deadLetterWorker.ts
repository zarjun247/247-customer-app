import { getDb } from "../db";
import { sql } from "drizzle-orm";

export async function processDeadLettersOnce() {
  const db = await getDb();
  if (!db) {
    console.error('[deadLetterWorker] DB unavailable');
    return { processed: 0 };
  }

  try {
    // Insert provider_dead_letters for provider_events already in dead_letter state if missing
    const insertSql = sql`INSERT INTO provider_dead_letters (providerEventId, reason, attemptCount, lastError, createdAt)
      SELECT ev.id, ev.errorMessage, COALESCE(ev.attemptCount,0), ev.errorMessage, NOW()
      FROM provider_events ev
      WHERE ev.status = 'dead_letter' AND NOT EXISTS (SELECT 1 FROM provider_dead_letters pd WHERE pd.providerEventId = ev.id)
      LIMIT 100`;

    await db.execute(insertSql);

    const [deadLetters] = await db.execute(sql`SELECT pd.id, pd.providerEventId, pd.reason, pd.attemptCount, pd.lastError, pd.createdAt FROM provider_dead_letters pd ORDER BY pd.createdAt DESC LIMIT 50`);

    console.log('[deadLetterWorker] Processed dead letters. Latest snapshot:');
    console.log(JSON.stringify(deadLetters, null, 2));
    return { processed: Array.isArray(deadLetters) ? deadLetters.length : 0 };
  } catch (error) {
    console.error('[deadLetterWorker] Error processing dead letters:', error?.message ?? error);
    return { processed: 0, error };
  }
}

// allow running directly via tsx
if (require.main === module) {
  (async () => {
    const res = await processDeadLettersOnce();
    if (res && (res as any).processed >= 0) process.exit(0);
    process.exit(2);
  })();
}
