import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
  bigint,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

export const notificationEvents = mysqlTable("notification_events", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  channel: mysqlEnum("channel", [
    "in_app",
    "push",
    "email",
    "whatsapp",
    "sms",
  ]).notNull(),
  type: varchar("type", { length: 80 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body").notNull(),
  safePayloadJson: text("safePayloadJson"),
  status: mysqlEnum("status", [
    "pending",
    "sent",
    "failed",
    "read",
    "provider_unconfigured",
    "retry_scheduled",
    "dead_letter",
    "skipped_demo",
  ])
    .default("pending")
    .notNull(),
  provider: varchar("provider", { length: 80 }),
  providerMessageId: varchar("providerMessageId", { length: 150 }),
  scheduledFor: timestamp("scheduledFor"),
  sentAt: timestamp("sentAt"),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const notificationPreferences = mysqlTable(
  "notification_preferences",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    channel: mysqlEnum("channel", [
      "in_app",
      "push",
      "email",
      "whatsapp",
      "sms",
    ]).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    allowSensitiveContent: boolean("allowSensitiveContent")
      .default(false)
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    userChannelUnique: uniqueIndex(
      "notification_preferences_user_channel_uq"
    ).on(t.userId, t.channel),
  })
);

// ─── Doctor Consult Requests ─────────────────────────────────────────────────
export const doctorConsultRequests = mysqlTable("doctor_consult_requests", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  consultType: mysqlEnum("consultType", ["instant", "scheduled"])
    .default("instant")
    .notNull(),
  status: mysqlEnum("status", [
    "requested",
    "assigned",
    "in_progress",
    "completed",
    "cancelled",
    "no_show",
  ])
    .default("requested")
    .notNull(),
  // Doctor assigned to this consult
  assignedDoctorName: varchar("assignedDoctorName", { length: 200 }),
  assignedDoctorReg: varchar("assignedDoctorReg", { length: 100 }),
  // Patient-stated reason for consult
  chiefComplaint: text("chiefComplaint"),
  // Doctor note after consult
  consultNote: text("consultNote"),
  // If doctor issued a prescription during consult, it is linked here
  linkedPrescriptionId: int("linkedPrescriptionId"),
  // Scheduling
  scheduledAt: timestamp("scheduledAt"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  requestedAt: timestamp("requestedAt").defaultNow().notNull(),
  // Consent: patient confirmed they understand this is a real medical consult
  consentGiven: boolean("consentGiven").default(false).notNull(),
  // Platform note (internal)
  platformNote: text("platformNote"),
});

export const messageTemplates = mysqlTable("message_templates", {
  id: int("id").autoincrement().primaryKey(),
  templateName: varchar("templateName", { length: 200 }).notNull(),
  channel: mysqlEnum("channel", ["whatsapp", "sms", "email", "app"])
    .default("sms")
    .notNull(),
  messageBody: text("messageBody").notNull(),
  variables: text("variables"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Type exports ─────────────────────────────────────────────────────────────
export type DoctorConsultRequest = typeof doctorConsultRequests.$inferSelect;
