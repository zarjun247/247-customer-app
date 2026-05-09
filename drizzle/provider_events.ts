import { mysqlEnum, mysqlTable, text, int, timestamp, varchar, json, index } from "drizzle-orm/mysql-core";

export const providerEvents = mysqlTable("provider_events", {
  id: int("id").autoincrement().primaryKey(),
  provider: varchar("provider", { length: 100 }).notNull(),
  operation: varchar("operation", { length: 100 }).notNull(),
  status: mysqlEnum("status", ["pending", "queued", "processing", "completed", "failed", "provider_unconfigured", "retry_scheduled", "dead_letter", "cancelled"]).default("pending").notNull(),
  correlationId: varchar("correlationId", { length: 128 }),
  attemptCount: int("attemptCount").default(0).notNull(),
  payload: json("payload"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  idxProviderStatus: index("idx_provider_events_provider_status").on(t.provider, t.status),
  idxCorrelation: index("idx_provider_events_correlation").on(t.correlationId),
}))

export const providerDeadLetters = mysqlTable("provider_dead_letters", {
  id: int("id").autoincrement().primaryKey(),
  providerEventId: int("providerEventId").notNull(),
  reason: text("reason"),
  attemptCount: int("attemptCount").default(0).notNull(),
  lastError: text("lastError"),
  operatorReviewed: varchar("operatorReviewed", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
})
