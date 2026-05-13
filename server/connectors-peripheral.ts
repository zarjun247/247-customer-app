import {
  providerUnavailableResult,
  type PrinterProviderResult,
  type ErpProviderResult,
} from "./connectors";

// ─── Label Printer Connector ──────────────────────────────────────────────────

export interface LabelPrinterConnector {
  printDispatchLabel(params: {
    orderId: number;
    customerName: string;
    address: string;
    phone: string;
    items: Array<{ name: string; qty: number }>;
    barcodeData?: string;
  }): Promise<boolean>;

  printDispatchLabelDetailed(params: {
    orderId: number;
    customerName: string;
    address: string;
    phone: string;
    items: Array<{ name: string; qty: number }>;
    barcodeData?: string;
  }): Promise<PrinterProviderResult>;

  printBatchLabel(params: {
    productName: string;
    batchNumber: string;
    expiryDate: string;
    mrp: string;
    barcode?: string;
  }): Promise<boolean>;

  printBatchLabelDetailed(params: {
    productName: string;
    batchNumber: string;
    expiryDate: string;
    mrp: string;
    barcode?: string;
  }): Promise<PrinterProviderResult>;

  generateDispatchLabelZpl(params: {
    orderId: number;
    customerName: string;
    address: string;
    phone: string;
    items: Array<{ name: string; qty: number }>;
    barcodeData?: string;
  }): string;

  generateBatchLabelZpl(params: {
    productName: string;
    batchNumber: string;
    expiryDate: string;
    mrp: string;
    barcode?: string;
  }): string;
}

export const labelPrinterConnector: LabelPrinterConnector = {
  generateDispatchLabelZpl({
    orderId,
    customerName,
    address,
    phone,
    items,
    barcodeData,
  }) {
    const barcode = barcodeData ?? `ORD-${orderId}`;
    const itemsText = items
      .map(i => `${i.name} x${i.qty}`)
      .join(", ")
      .substring(0, 60);

    return `^XA
^PW812
^LL406
^FO30,20^A0N,35,35^FD24/7 Pharmacy^FS
^FO30,60^A0N,22,22^FDOrder ORD-${String(orderId).padStart(6, "0")}^FS
^FO30,90^GB752,2,2^FS
^FO30,100^A0N,28,28^FD${customerName.substring(0, 30)}^FS
^FO30,135^A0N,20,20^FD${address.substring(0, 50)}^FS
^FO30,160^A0N,18,18^FDPh: ${phone}^FS
^FO30,185^GB752,2,2^FS
^FO30,195^A0N,18,18^FD${itemsText}^FS
^FO30,230^BCN,80,Y,N,N^FD${barcode}^FS
^XZ`;
  },

  generateBatchLabelZpl({
    productName,
    batchNumber,
    expiryDate,
    mrp,
    barcode,
  }) {
    const bc = barcode ?? batchNumber;

    return `^XA
^PW406
^LL203
^FO10,10^A0N,22,22^FD${productName.substring(0, 25)}^FS
^FO10,38^A0N,18,18^FDBatch: ${batchNumber}^FS
^FO10,60^A0N,18,18^FDExp: ${expiryDate}  MRP: Rs.${mrp}^FS
^FO10,85^BCN,70,Y,N,N^FD${bc}^FS
^XZ`;
  },

  async printDispatchLabel(params) {
    const result = await this.printDispatchLabelDetailed(params);
    return result.status === "printed";
  },

  async printDispatchLabelDetailed(params) {
    const zpl = this.generateDispatchLabelZpl(params);
    const host = process.env.PRINTER_HOST;
    const port = parseInt(process.env.PRINTER_PORT ?? "9100", 10);

    if (!host) {
      const result = providerUnavailableResult<
        "provider_unconfigured" | "skipped_demo"
      >("Label printer", ["PRINTER_HOST"]);

      if (result.status === "skipped_demo") {
        console.log(
          `[Printer DEMO SKIPPED] Dispatch label for order #${params.orderId}:\n${zpl}`
        );
      }

      return { ...result, zpl };
    }

    try {
      const net = await import("net");

      await new Promise<void>((resolve, reject) => {
        const socket = net.createConnection(port, host, () => {
          socket.write(zpl, "utf8", () => {
            socket.end();
            resolve();
          });
        });

        socket.on("error", reject);
        socket.setTimeout(5000, () => {
          socket.destroy();
          reject(new Error("Printer timeout"));
        });
      });

      return { status: "printed", ok: true, zpl };
    } catch (err) {
      console.error("[Printer] Failed to send dispatch label:", err);

      return {
        status: "failed",
        ok: false,
        reason: "Printer delivery failed",
        zpl,
      };
    }
  },

  async printBatchLabel(params) {
    const result = await this.printBatchLabelDetailed(params);
    return result.status === "printed";
  },

  async printBatchLabelDetailed(params) {
    const zpl = this.generateBatchLabelZpl(params);
    const host = process.env.PRINTER_HOST;
    const port = parseInt(process.env.PRINTER_PORT ?? "9100", 10);

    if (!host) {
      const result = providerUnavailableResult<
        "provider_unconfigured" | "skipped_demo"
      >("Label printer", ["PRINTER_HOST"]);

      if (result.status === "skipped_demo") {
        console.log(
          `[Printer DEMO SKIPPED] Batch label for ${params.productName}:\n${zpl}`
        );
      }

      return { ...result, zpl };
    }

    try {
      const net = await import("net");

      await new Promise<void>((resolve, reject) => {
        const socket = net.createConnection(port, host, () => {
          socket.write(zpl, "utf8", () => {
            socket.end();
            resolve();
          });
        });

        socket.on("error", reject);
        socket.setTimeout(5000, () => {
          socket.destroy();
          reject(new Error("Printer timeout"));
        });
      });

      return { status: "printed", ok: true, zpl };
    } catch (err) {
      console.error("[Printer] Failed to send batch label:", err);

      return {
        status: "failed",
        ok: false,
        reason: "Printer delivery failed",
        zpl,
      };
    }
  },
};

// ─── ERP Sync Connector ───────────────────────────────────────────────────────

export interface ErpSyncConnector {
  pushGrn(params: {
    ingestionId: number;
    storeId: number;
    items: Array<{
      productName: string;
      batchNumber: string;
      qty: number;
      unitCost: number;
      mrp: number;
    }>;
  }): Promise<ErpProviderResult>;

  pushSalesOrder(params: {
    orderId: number;
    storeId: number;
    totalAmount: number;
    items: Array<{
      productName: string;
      qty: number;
      unitPrice: number;
      hsnCode?: string;
      gstRate?: number;
    }>;
  }): Promise<ErpProviderResult>;
}

export const erpConnector: ErpSyncConnector = {
  async pushGrn({ ingestionId, storeId, items }) {
    const baseUrl = process.env.ERP_BASE_URL;
    const apiKey = process.env.ERP_API_KEY;
    const companyId = process.env.ERP_COMPANY_ID;

    const missing = [
      ...(!baseUrl ? ["ERP_BASE_URL"] : []),
      ...(!apiKey ? ["ERP_API_KEY"] : []),
    ];

    if (missing.length > 0) {
      const result = providerUnavailableResult<
        "provider_unconfigured" | "skipped_demo"
      >("ERP", missing);

      if (result.status === "skipped_demo") {
        console.log(
          `[ERP DEMO SKIPPED] Push GRN for ingestion #${ingestionId}, store #${storeId}, ${items.length} items`
        );
      }

      return { ...result, erpRef: null };
    }

    try {
      const res = await fetch(`${baseUrl}/grn`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey as string,
          ...(companyId ? { "X-Company-ID": companyId } : {}),
        },
        body: JSON.stringify({ ingestionId, storeId, items }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`[ERP] pushGrn error: ${res.status} ${text}`);

        return {
          erpRef: null,
          status: "failed",
          ok: false,
          reason: `ERP GRN sync failed: ${res.status}`,
        };
      }

      const data = (await res.json()) as { ref?: string; status?: string };

      return {
        erpRef: data.ref ?? `GRN-${ingestionId}`,
        status: "synced",
        ok: true,
        reason: data.status,
      };
    } catch (err) {
      console.error("[ERP] pushGrn failed:", err);

      return {
        erpRef: null,
        status: "failed",
        ok: false,
        reason: "ERP GRN sync failed",
      };
    }
  },

  async pushSalesOrder({ orderId, storeId, totalAmount, items }) {
    const baseUrl = process.env.ERP_BASE_URL;
    const apiKey = process.env.ERP_API_KEY;
    const companyId = process.env.ERP_COMPANY_ID;

    const missing = [
      ...(!baseUrl ? ["ERP_BASE_URL"] : []),
      ...(!apiKey ? ["ERP_API_KEY"] : []),
    ];

    if (missing.length > 0) {
      const result = providerUnavailableResult<
        "provider_unconfigured" | "skipped_demo"
      >("ERP", missing);

      if (result.status === "skipped_demo") {
        console.log(
          `[ERP DEMO SKIPPED] Push sales order #${orderId}, store #${storeId}, ₹${totalAmount}`
        );
      }

      return { ...result, erpRef: null };
    }

    try {
      const res = await fetch(`${baseUrl}/sales-orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey as string,
          ...(companyId ? { "X-Company-ID": companyId } : {}),
        },
        body: JSON.stringify({ orderId, storeId, totalAmount, items }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`[ERP] pushSalesOrder error: ${res.status} ${text}`);

        return {
          erpRef: null,
          status: "failed",
          ok: false,
          reason: `ERP sales order sync failed: ${res.status}`,
        };
      }

      const data = (await res.json()) as { ref?: string; status?: string };

      return {
        erpRef: data.ref ?? `SO-${orderId}`,
        status: "synced",
        ok: true,
        reason: data.status,
      };
    } catch (err) {
      console.error("[ERP] pushSalesOrder failed:", err);

      return {
        erpRef: null,
        status: "failed",
        ok: false,
        reason: "ERP sales order sync failed",
      };
    }
  },
};
