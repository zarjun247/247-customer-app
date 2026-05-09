import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  approvalStatusForException,
  assertOcrDraftApprovedForHandoff,
  buildOcrExceptionReport,
  classifyOcrLineException,
} from "./services/ocrPurchaseInwarding";

describe("OCR invoice exception workflow", () => {
  const cleanLine = {
    confidence: 96,
    batchNo: "B2401",
    expiryDate: "2027-12-31",
    qty: 10,
    mrp: "120.00",
    purchaseRate: "80.00",
    hsnCode: "30049099",
    gstRate: "12.00",
    matchedProductId: 101,
    mappedSupplierSkuId: 501,
    matchConfidence: 100,
    candidateCount: 1,
  };

  it("clean invoice line maps without exception but still requires human approval before handoff", () => {
    expect(classifyOcrLineException(cleanLine)).toBeNull();
    expect(approvalStatusForException(null)).toBe("pending");
    expect(() => assertOcrDraftApprovedForHandoff({ status: "draft" }, [{ ...cleanLine, productId: 101, status: "pending", approvalStatus: "pending", exceptionReason: null }])).toThrow(TRPCError);
  });

  it("routes ambiguous product to exception", () => {
    expect(classifyOcrLineException({ ...cleanLine, candidateCount: 2 })).toBe("ambiguous_product");
  });

  it("routes low confidence to exception", () => {
    expect(classifyOcrLineException({ ...cleanLine, confidence: 45 })).toBe("low_confidence");
  });

  it("routes missing batch to exception", () => {
    expect(classifyOcrLineException({ ...cleanLine, batchNo: "" })).toBe("missing_batch");
  });

  it("routes missing expiry to exception", () => {
    expect(classifyOcrLineException({ ...cleanLine, expiryDate: null })).toBe("missing_expiry");
  });

  it("routes missing MRP/cost to exception", () => {
    expect(classifyOcrLineException({ ...cleanLine, mrp: 0 })).toBe("missing_mrp");
    expect(classifyOcrLineException({ ...cleanLine, purchaseRate: 0 })).toBe("missing_cost");
  });

  it("routes missing HSN/GST and regulated schedule gaps to exceptions", () => {
    expect(classifyOcrLineException({ ...cleanLine, hsnCode: "" })).toBe("missing_hsn_or_gst");
    expect(classifyOcrLineException({ ...cleanLine, regulatedRequiresSchedule: true, schedule: null })).toBe("missing_schedule_for_regulated");
  });

  it("routes supplier SKU below confidence threshold to exception", () => {
    expect(classifyOcrLineException({ ...cleanLine, supplierSku: "SUP-1", mappedSupplierSkuId: null, matchConfidence: 80 })).toBe("supplier_sku_unmapped");
  });

  it("approved OCR draft can hand off to existing purchase commit path", () => {
    expect(() => assertOcrDraftApprovedForHandoff({ status: "approved" }, [{ ...cleanLine, productId: 101, status: "approved", approvalStatus: "approved", exceptionReason: null }])).not.toThrow();
  });

  it("unapproved or exception OCR draft cannot commit stock", () => {
    expect(() => assertOcrDraftApprovedForHandoff({ status: "approved" }, [{ ...cleanLine, productId: 101, status: "pending", approvalStatus: "pending", exceptionReason: null }])).toThrow(TRPCError);
    expect(() => assertOcrDraftApprovedForHandoff({ status: "approved" }, [{ ...cleanLine, productId: 101, status: "approved", approvalStatus: "approved", exceptionReason: "missing_batch" }])).toThrow(TRPCError);
  });

  it("OCR flow does not directly call stock mutation/invariant except through approved purchase handoff", () => {
    const fs = require('fs');
    const path = require('path');
    const targets = ['server/routers/ocrIngestionRouter.ts', 'server/services/ocrPurchaseInwarding.ts'];
    const pattern = /increaseStockForPurchaseCommit|applyStockMovement|insert\(stockMovements\)|update\(batchLedger\)|syncStoreSkuAggregate/;
    const matches = [];
    for (const t of targets) {
      if (!fs.existsSync(t)) continue;
      const txt = fs.readFileSync(t, 'utf8');
      if (pattern.test(txt)) matches.push(t);
    }
    expect(matches.length).toBe(0);
  });

  it("exception report totals are correct", () => {
    expect(buildOcrExceptionReport([
      { exceptionReason: "low_confidence", approvalStatus: "held" },
      { exceptionReason: "missing_batch", approvalStatus: "held" },
      { exceptionReason: "low_confidence", approvalStatus: "rejected" },
      { exceptionReason: null, approvalStatus: "approved" },
    ])).toEqual({
      totalRows: 4,
      byExceptionReason: { low_confidence: 2, missing_batch: 1, none: 1 },
      byApprovalStatus: { held: 2, rejected: 1, approved: 1 },
    });
  });
});
