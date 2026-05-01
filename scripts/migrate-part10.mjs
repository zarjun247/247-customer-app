import { createConnection } from "mysql2/promise";

const url = process.env.DATABASE_URL;
const conn = await createConnection(url);

const statements = [
  `CREATE TABLE IF NOT EXISTS \`whatsapp_links\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`phone\` varchar(20) NOT NULL,
    \`userId\` int NOT NULL,
    \`verifiedAt\` timestamp NOT NULL,
    \`verificationMethod\` enum('otp','app_login','staff_override') NOT NULL DEFAULT 'otp',
    \`isActive\` boolean NOT NULL DEFAULT true,
    \`linkedBy\` int,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`whatsapp_links_id\` PRIMARY KEY(\`id\`),
    CONSTRAINT \`whatsapp_links_phone_unique\` UNIQUE(\`phone\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`whatsapp_messages\` (
    \`id\` bigint AUTO_INCREMENT NOT NULL,
    \`phone\` varchar(20) NOT NULL,
    \`userId\` int,
    \`direction\` enum('inbound','outbound') NOT NULL,
    \`messageType\` enum('text','image','document','audio','template','button','interactive') NOT NULL DEFAULT 'text',
    \`body\` text,
    \`mediaUrl\` text,
    \`mediaKey\` varchar(500),
    \`templateName\` varchar(100),
    \`templateParams\` text,
    \`externalMsgId\` varchar(200),
    \`sessionId\` int,
    \`flow\` varchar(50),
    \`status\` enum('received','sent','delivered','read','failed') NOT NULL DEFAULT 'received',
    \`errorCode\` varchar(50),
    \`errorMessage\` varchar(500),
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`whatsapp_messages_id\` PRIMARY KEY(\`id\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`whatsapp_carts\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`phone\` varchar(20) NOT NULL,
    \`userId\` int,
    \`storeId\` int,
    \`status\` enum('active','confirmed','expired','abandoned') NOT NULL DEFAULT 'active',
    \`prescriptionId\` int,
    \`deliveryAddress\` text,
    \`flatNumber\` varchar(50),
    \`buildingId\` int,
    \`convertedOrderId\` int,
    \`expiresAt\` timestamp,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`whatsapp_carts_id\` PRIMARY KEY(\`id\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`whatsapp_cart_lines\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`cartId\` int NOT NULL,
    \`productId\` int NOT NULL,
    \`variantId\` int,
    \`storeSkuId\` int NOT NULL,
    \`qty\` int NOT NULL DEFAULT 1,
    \`unitPrice\` varchar(20) NOT NULL,
    \`lineTotal\` varchar(20) NOT NULL,
    \`requiresPrescription\` boolean NOT NULL DEFAULT false,
    \`addedAt\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`whatsapp_cart_lines_id\` PRIMARY KEY(\`id\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`waba_message_templates\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`name\` varchar(100) NOT NULL,
    \`category\` enum('order_status','refill_reminder','rx_received','delivery_otp','bill_share','staff_handoff','delivery_exception','welcome','supplier_bill','custom') NOT NULL,
    \`language\` varchar(10) NOT NULL DEFAULT 'en',
    \`body\` text NOT NULL,
    \`headerText\` varchar(200),
    \`footerText\` varchar(200),
    \`buttonLabels\` text,
    \`paramCount\` int NOT NULL DEFAULT 0,
    \`paramDescriptions\` text,
    \`wabaTemplateId\` varchar(200),
    \`wabaStatus\` enum('draft','pending','approved','rejected') NOT NULL DEFAULT 'draft',
    \`isActive\` boolean NOT NULL DEFAULT true,
    \`createdBy\` int,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`waba_message_templates_id\` PRIMARY KEY(\`id\`),
    CONSTRAINT \`waba_message_templates_name_unique\` UNIQUE(\`name\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`staff_handoffs\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`phone\` varchar(20) NOT NULL,
    \`userId\` int,
    \`sessionId\` int,
    \`reason\` enum('customer_request','bot_confused','rx_clarification','delivery_exception','complaint','supplier_bill','other') NOT NULL,
    \`reasonNote\` text,
    \`status\` enum('open','assigned','resolved','closed') NOT NULL DEFAULT 'open',
    \`assignedTo\` int,
    \`assignedAt\` timestamp,
    \`resolvedAt\` timestamp,
    \`resolutionNote\` text,
    \`priority\` enum('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
    \`relatedOrderId\` int,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`staff_handoffs_id\` PRIMARY KEY(\`id\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`whatsapp_webhook_log\` (
    \`id\` bigint AUTO_INCREMENT NOT NULL,
    \`source\` varchar(50) NOT NULL DEFAULT 'waba',
    \`payload\` text NOT NULL,
    \`signature\` varchar(500),
    \`signatureValid\` boolean,
    \`processedAt\` timestamp,
    \`errorMessage\` varchar(500),
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`whatsapp_webhook_log_id\` PRIMARY KEY(\`id\`)
  )`,
];

for (const sql of statements) {
  const tableName = sql.match(/CREATE TABLE IF NOT EXISTS `(\w+)`/)?.[1] ?? "?";
  try {
    await conn.execute(sql);
    console.log(`✓ ${tableName}`);
  } catch (e) {
    console.error(`✗ ${tableName}: ${e.message}`);
  }
}

await conn.end();
console.log("Migration complete.");
