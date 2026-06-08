import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "../db";
import { redactSensitive } from "../_core/redact";
import {
  whatsappCarts,
  whatsappCartLines,
  storeSkus,
  users,
  buildings,
  products,
  refillPlans,
  ingestionJobs,
} from "../../drizzle/schema";
import {
  getCatalog,
  getOrderById,
  getOrdersByUser,
  getOrderItemsForReorder,
  createOrder,
  createWhatsappPrescription,
  writeAuditLog,
} from "../db";
import type { ResultSetHeader } from "mysql2";
import {
  formatSearchResults,
  formatOrderStatus,
  createRegulatedIntentHandoff,
} from "./whatsappHelpers";

type FlowResult = {
  response: string;
  nextFlow: string;
  nextState: Record<string, unknown>;
};

export async function handleSearchFlow(opts: {
  flow: string;
  state: Record<string, unknown>;
  userId: number | null;
  message: string;
}): Promise<FlowResult> {
  const { flow, state, userId, message } = opts;
  if (flow !== "search" || !state.searching) {
    return {
      response: "🔍 Type the medicine name to search:",
      nextFlow: "search",
      nextState: { searching: true },
    };
  }
  const db = await getDb();
  if (db && message.trim().length >= 2) {
    let storeId = 1;
    if (userId) {
      const userRow = await db
        .select({ buildingId: users.buildingId })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (userRow[0]?.buildingId) {
        const bldg = await db
          .select({ primaryStoreId: buildings.primaryStoreId })
          .from(buildings)
          .where(eq(buildings.id, userRow[0].buildingId))
          .limit(1);
        if (bldg[0]?.primaryStoreId) storeId = bldg[0].primaryStoreId;
      }
    }
    const results = await getCatalog(storeId, message.trim(), undefined, 5);
    return {
      response: formatSearchResults(results),
      nextFlow: "search_results",
      nextState: {
        searchResults: results.map(r => ({
          skuId: r.skuId,
          name: r.name,
          price: r.sellingPrice,
        })),
        awaitingSelection: true,
      },
    };
  }
  return {
    response: "Please type at least 2 characters to search.",
    nextFlow: "search",
    nextState: { searching: true },
  };
}

export async function handleSearchResultsFlow(opts: {
  phone: string;
  userId: number | null;
  state: Record<string, unknown>;
  message: string;
}): Promise<FlowResult> {
  const { phone, userId, state, message } = opts;
  const idx = parseInt(message.trim()) - 1;
  const results =
    (state.searchResults as
      | { skuId: number; name: string; price: string | number }[]
      | undefined) ?? [];
  if (!isNaN(idx) && idx >= 0 && idx < results.length) {
    const item = results[idx];
    const db = await getDb();
    if (db) {
      let cart = (
        await db
          .select()
          .from(whatsappCarts)
          .where(
            and(
              eq(whatsappCarts.phone, phone),
              eq(whatsappCarts.status, "active")
            )
          )
          .limit(1)
      )[0];
      if (!cart) {
        const newCartInsert = await db.insert(whatsappCarts).values({
          phone,
          userId: userId ?? null,
          status: "active",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });
        const [newCartHeader] = newCartInsert as unknown as [ResultSetHeader];
        cart = { id: newCartHeader.insertId } as typeof cart;
      }
      const sku = await db
        .select()
        .from(storeSkus)
        .where(eq(storeSkus.id, item.skuId))
        .limit(1);
      if (sku[0]) {
        await db.insert(whatsappCartLines).values({
          cartId: cart.id,
          productId: sku[0].productId,
          variantId: sku[0].variantId ?? null,
          storeSkuId: item.skuId,
          qty: 1,
          unitPrice: sku[0].sellingPrice ?? "0",
          lineTotal: sku[0].sellingPrice ?? "0",
          requiresPrescription: false,
        });
      }
    }
    return {
      response: `✓ *${item.name}* added to cart.\n\nReply *cart* to view cart, *1* to search more, or *hi* for menu.`,
      nextFlow: "menu",
      nextState: {},
    };
  }
  return {
    response:
      "Invalid selection. Reply with a number from the list, or *hi* for menu.",
    nextFlow: "search_results",
    nextState: state,
  };
}

export async function handleOrderStatusFlow(opts: {
  userId: number | null;
  flow: string;
  state: Record<string, unknown>;
  msg: string;
  message: string;
}): Promise<FlowResult> {
  const { userId, flow, state, msg, message } = opts;
  void msg;
  if (flow !== "status" || !state.awaitingOrderId) {
    if (userId) {
      const userOrders = await getOrdersByUser(userId);
      if (userOrders.length) {
        const recent = userOrders
          .slice(0, 3)
          .map(o => `#${o.id} — ${o.status} — ₹${o.total}`)
          .join("\n");
        return {
          response: `*Your recent orders:*\n${recent}\n\nReply with Order ID for details, or *hi* for menu.`,
          nextFlow: "status",
          nextState: { awaitingOrderId: true },
        };
      }
      return {
        response: "No orders found.\n\nReply *hi* for main menu.",
        nextFlow: "status",
        nextState: { awaitingOrderId: true },
      };
    }
    return {
      response:
        "⚠️ Your phone is not linked to an account, so I cannot show private order details on WhatsApp. Please link your account in the app or ask staff for help.",
      nextFlow: "menu",
      nextState: {},
    };
  }
  const orderId = parseInt(message.trim());
  if (!isNaN(orderId)) {
    const order = await getOrderById(orderId);
    if (order) {
      if (!userId || order.userId !== userId) {
        return {
          response:
            "⚠️ I cannot show private order details for this WhatsApp session. Please use the linked account in the 24/7 app or ask staff for help.\n\nReply *hi* for main menu.",
          nextFlow: "menu",
          nextState: {},
        };
      }
      return {
        response: formatOrderStatus(order),
        nextFlow: "menu",
        nextState: {},
      };
    }
    return {
      response: `Order #${orderId} not found.\n\nReply *hi* for main menu.`,
      nextFlow: "menu",
      nextState: {},
    };
  }
  return {
    response:
      "Invalid Order ID. Please enter a number.\n\nReply *hi* for main menu.",
    nextFlow: "menu",
    nextState: {},
  };
}

export async function handleRxUploadFlow(opts: {
  phone: string;
  userId: number | null;
  messageType: string;
  imageUrl?: string;
  documentUrl?: string;
}): Promise<FlowResult> {
  const { phone, userId, messageType, imageUrl, documentUrl } = opts;
  if (messageType === "image" && imageUrl) {
    // Use a random UUID key — never embed the phone number (PII) or a
    // predictable timestamp in the storage path.
    const key = `whatsapp-rx/${randomUUID()}.jpg`;
    const rxId = await createWhatsappPrescription(phone, imageUrl, key);
    const response = rxId
      ? `📋 Prescription received! (Ref: RX-${rxId})\nOur pharmacist will review it shortly.\n\nReply *hi* for main menu.`
      : "Prescription received. Our pharmacist will review it shortly.\n\nReply *hi* for main menu.";
    await writeAuditLog({
      actor: { id: userId ?? null, type: "whatsapp" },
      action: "whatsapp.rx.uploaded",
      entityType: "prescription",
      entityId: rxId ?? undefined,
      payload: JSON.stringify({ phone: redactSensitive(phone) }), // PII-safe
    });
    return { response, nextFlow: "menu", nextState: {} };
  }
  if (messageType === "document" && documentUrl) {
    const db = await getDb();
    if (db) {
      const ingestionInsert = await db.insert(ingestionJobs).values({
        storeId: 1,
        sourceType: "whatsapp",
        supplierHint: `WhatsApp upload from ${phone}`,
        fileUrl: documentUrl,
        fileKey: `whatsapp-bill/${randomUUID()}.pdf`,
        createdBy: userId ?? 0,
      });
      const [ingestionHeader] = ingestionInsert as unknown as [ResultSetHeader];
      const jobId = ingestionHeader.insertId;
      await writeAuditLog({
        actor: { id: userId ?? null, type: "whatsapp" },
        action: "whatsapp.supplier_bill.uploaded",
        entityType: "ingestion_job",
        entityId: jobId,
        payload: JSON.stringify({ phone: redactSensitive(phone) }), // PII-safe
      });
      return {
        response: `📄 Supplier bill received! (Job #${jobId})\nOur team will process and import it.\n\nReply *hi* for main menu.`,
        nextFlow: "menu",
        nextState: {},
      };
    }
    return {
      response:
        "Document received. Our team will process it.\n\nReply *hi* for main menu.",
      nextFlow: "menu",
      nextState: {},
    };
  }
  return {
    response:
      "Please send your prescription as an *image* (photo), or a supplier bill as a *PDF document*.",
    nextFlow: "rx_upload",
    nextState: { awaitingImage: true },
  };
}

export async function handleReorderFlow(opts: {
  phone: string;
  userId: number | null;
  flow: string;
  state: Record<string, unknown>;
  msg: string;
}): Promise<FlowResult> {
  const { phone, userId, flow, state, msg } = opts;
  if (!userId) {
    return {
      response:
        "⚠️ Your phone is not linked to an account.\n\nPlease ask our staff to link your account, or log in via the 24/7 app.\n\nReply *hi* for main menu.",
      nextFlow: "menu",
      nextState: {},
    };
  }
  if (flow !== "reorder" || !state.awaitingConfirm) {
    const userOrders = await getOrdersByUser(userId);
    const lastOrder = userOrders[0];
    if (!lastOrder) {
      return {
        response: "No previous orders found.\n\nReply *hi* for main menu.",
        nextFlow: "menu",
        nextState: {},
      };
    }
    const items = await getOrderItemsForReorder(lastOrder.id);
    const itemList = items
      .slice(0, 5)
      .map(i => `• ${i.name ?? `Product #${i.productId}`} × ${i.quantity}`)
      .join("\n");
    return {
      response: `*Reorder from Order #${lastOrder.id}:*\n${itemList}\n\nTotal was: ₹${lastOrder.total}\n\nReply *yes* to reorder, or *hi* to cancel.`,
      nextFlow: "reorder",
      nextState: { awaitingConfirm: true, orderId: lastOrder.id },
    };
  }
  if (state.awaitingConfirm && (msg === "yes" || msg === "y")) {
    const items = await getOrderItemsForReorder(state.orderId as number);
    const db = await getDb();
    if (db && items.length) {
      const existingCart = (
        await db
          .select()
          .from(whatsappCarts)
          .where(
            and(
              eq(whatsappCarts.phone, phone),
              eq(whatsappCarts.status, "active")
            )
          )
          .limit(1)
      )[0];
      if (existingCart) {
        await db
          .delete(whatsappCartLines)
          .where(eq(whatsappCartLines.cartId, existingCart.id));
        await db
          .update(whatsappCarts)
          .set({ status: "abandoned" })
          .where(eq(whatsappCarts.id, existingCart.id));
      }
      const reorderCartInsert = await db.insert(whatsappCarts).values({
        phone,
        userId: userId ?? null,
        status: "active",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      const [reorderCartHeader] = reorderCartInsert as unknown as [
        ResultSetHeader,
      ];
      const cartId = reorderCartHeader.insertId;
      for (const item of items) {
        if (item.storeSkuId) {
          const skuRow = await db
            .select({ sellingPrice: storeSkus.sellingPrice })
            .from(storeSkus)
            .where(eq(storeSkus.id, item.storeSkuId))
            .limit(1);
          const unitPrice = skuRow[0]?.sellingPrice ?? "0";
          const lineTotal = (parseFloat(unitPrice) * item.quantity).toFixed(2);
          await db.insert(whatsappCartLines).values({
            cartId,
            productId: item.productId,
            variantId: null,
            storeSkuId: item.storeSkuId,
            qty: item.quantity,
            unitPrice,
            lineTotal,
            requiresPrescription: false,
          });
        }
      }
      return {
        response: `✓ Cart loaded with ${items.length} item(s) from Order #${state.orderId as number}.\n\nReply *cart* to review, or *confirm* to place order.`,
        nextFlow: "menu",
        nextState: {},
      };
    }
    return {
      response:
        "Could not load items. Please try again.\n\nReply *hi* for main menu.",
      nextFlow: "menu",
      nextState: {},
    };
  }
  return {
    response: "Reorder cancelled.\n\nReply *hi* for main menu.",
    nextFlow: "menu",
    nextState: {},
  };
}

export async function handleConfirmOrderFlow(opts: {
  phone: string;
  userId: number;
  sessionId?: number;
}): Promise<FlowResult> {
  const { phone, userId, sessionId } = opts;
  const db = await getDb();
  if (!db) {
    return {
      response:
        "Could not place order. Please try again.\n\nReply *hi* for main menu.",
      nextFlow: "menu",
      nextState: {},
    };
  }
  const cart = (
    await db
      .select()
      .from(whatsappCarts)
      .where(
        and(eq(whatsappCarts.phone, phone), eq(whatsappCarts.status, "active"))
      )
      .limit(1)
  )[0];
  if (!cart || !cart.storeId) {
    return {
      response:
        "Cart is empty or store not set. Reply *1* to search medicines first.",
      nextFlow: "menu",
      nextState: {},
    };
  }
  const lines = await db
    .select({
      line: whatsappCartLines,
      schedule: products.schedule,
      requiresPrescription: products.requiresPrescription,
    })
    .from(whatsappCartLines)
    .leftJoin(products, eq(whatsappCartLines.productId, products.id))
    .where(eq(whatsappCartLines.cartId, cart.id));
  if (!lines.length) {
    return {
      response: "Cart is empty. Reply *1* to search medicines.",
      nextFlow: "menu",
      nextState: {},
    };
  }
  const regulated = lines.some(
    l =>
      ["H", "H1", "X"].includes(String(l.schedule ?? "")) ||
      Boolean(l.requiresPrescription)
  );
  if (regulated) {
    const handoffId = await createRegulatedIntentHandoff({
      phone,
      userId,
      sessionId,
      message: "regulated cart confirmation",
    });
    await writeAuditLog({
      actor: { id: userId, type: "whatsapp" },
      action: "whatsapp.regulated_escalated",
      entityType: "whatsapp_cart",
      entityId: cart.id,
      payload: JSON.stringify({ phone: redactSensitive(phone), handoffId }), // PII-safe
    });
    return {
      response:
        "Regulated medicine request received. I cannot auto-confirm this refill/order on WhatsApp. A pharmacist will review your prescription before order confirmation. Reply with your prescription image or wait for pharmacist assistance.",
      nextFlow: "staff_handoff",
      nextState: { reason: "regulated_medicine", handoffId },
    };
  }
  const subtotal = lines
    .reduce((s, l) => s + parseFloat(l.line.lineTotal), 0)
    .toFixed(2);
  const orderId = await createOrder({
    userId,
    storeId: cart.storeId,
    prescriptionId: cart.prescriptionId ?? undefined,
    subtotal,
    total: subtotal,
    promisedSlaMins: 45,
    deliveryAddress: cart.deliveryAddress ?? undefined,
    flatNumber: cart.flatNumber ?? undefined,
    buildingId: cart.buildingId ?? undefined,
    source: "whatsapp",
    items: lines.map(l => ({
      productId: l.line.productId,
      variantId: l.line.variantId ?? undefined,
      storeSkuId: l.line.storeSkuId,
      quantity: l.line.qty,
      unitPrice: l.line.unitPrice,
      lineTotal: l.line.lineTotal,
    })),
  });
  await db
    .update(whatsappCarts)
    .set({ status: "confirmed", convertedOrderId: orderId })
    .where(eq(whatsappCarts.id, cart.id));
  await writeAuditLog({
    actor: { id: userId, type: "whatsapp" },
    action: "whatsapp.order.created",
    entityType: "order",
    entityId: orderId,
    payload: JSON.stringify({ phone: redactSensitive(phone), cartId: cart.id }), // PII-safe
  });
  return {
    response: `✓ *Order #${orderId} placed!*\nTotal: ₹${subtotal}\nEstimated delivery: ~45 mins\n\nReply *status ${orderId}* to track, or *hi* for main menu.`,
    nextFlow: "menu",
    nextState: {},
  };
}

export async function handleRefillFlow(opts: {
  userId: number | null;
}): Promise<FlowResult> {
  const { userId } = opts;
  if (!userId) {
    return {
      response:
        "⚠️ Your phone is not linked to an account.\n\nPlease ask our staff to link your account.\n\nReply *hi* for main menu.",
      nextFlow: "menu",
      nextState: {},
    };
  }
  const db = await getDb();
  if (db) {
    const plans = await db
      .select({
        id: refillPlans.id,
        productId: refillPlans.productId,
        nextDueDate: refillPlans.nextDueDate,
        status: refillPlans.status,
        productName: products.name,
      })
      .from(refillPlans)
      .leftJoin(products, eq(refillPlans.productId, products.id))
      .where(
        and(eq(refillPlans.userId, userId), eq(refillPlans.status, "active"))
      )
      .orderBy(refillPlans.nextDueDate)
      .limit(5);
    if (plans.length) {
      const lines = plans.map(p => {
        const due = p.nextDueDate
          ? new Date(p.nextDueDate).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
            })
          : "—";
        return `💊 ${p.productName ?? `Product #${p.productId}`} — Due: ${due}`;
      });
      return {
        response: `*Your Refill Schedule:*\n\n${lines.join("\n")}\n\nReply *reorder* to reorder, or open the 24/7 app for full schedule.`,
        nextFlow: "menu",
        nextState: {},
      };
    }
    return {
      response:
        "No active refill plans found.\n\nYour pharmacist will set up refill plans for your chronic medicines.\n\nReply *hi* for main menu.",
      nextFlow: "menu",
      nextState: {},
    };
  }
  return {
    response:
      "Your refill reminders are available in the 24/7 app under 'Refills'.\n\nReply *hi* for main menu.",
    nextFlow: "menu",
    nextState: {},
  };
}
