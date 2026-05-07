/**
 * AdminCounterBilling.tsx — PART 7: Counter Billing
 * Barcode scan, product search, FEFO batch selection, Rx gate, payment, print bill.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { BarcodeScannerInput, type BarcodeResolvedResult } from "@/components/barcode/BarcodeScannerInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Search, Barcode, Plus, Trash2, Printer, CheckCircle, AlertTriangle,
  ShieldAlert, User, Phone, CreditCard, Banknote, Smartphone, X,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ProductResult {
  id: number;
  name: string;
  brand: string | null;
  strength: string | null;
  dosageForm: string | null;
  packSize: string | null;
  gstRate: string | null;
  hsnCode: string | null;
  scheduleCode: string | null;
  requiresPrescription: boolean;
  prescriptionRequired: boolean;
  barcode: string | null;
  primaryBarcode: string | null;
}

interface BatchResult {
  id: number;
  batchNo: string;
  expiryDate: string | null;
  mrp: string | null;
  saleRate: string | null;
  qtyOnHand: number | null;
  qtyReserved: number | null;
  availableQty: number;
  daysToExpiry: number | null;
  isExpired: boolean;
  isCritical: boolean;
  isQuarantineCandidate: boolean;
}

interface CartLine {
  productId: string;
  productName: string;
  brand: string | null;
  strength: string | null;
  batchLedgerId: string | null;
  batchNo: string | null;
  expiryDate: string | null;
  mrp: number;
  saleRate: number;
  qty: number;
  discountPct: number;
  gstRate: number;
  hsnCode: string | null;
  requiresPrescription: boolean;
  scheduleCode: string | null;
  rxCleared: boolean;
  lineTotal: number;
}

const RX_SCHEDULES = ["H", "H1", "X", "Rx", "NRX"];

export default function AdminCounterBilling() {
  const DEFAULT_STORE_ID = "1";

  // ─── State ─────────────────────────────────────────────────────────────────
  const [saleId, setSaleId] = useState<string | null>(null);
  const [billNo, setBillNo] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [scanResult, setScanResult] = useState<BarcodeResolvedResult | null>(null);
  const [customerMobile, setCustomerMobile] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [salesmanCode, setSalesmanCode] = useState("");
  const [pharmacistCode, setPharmacistCode] = useState("");
  const [pharmacistName, setPharmacistName] = useState("");
  const [pharmacistRegNo, setPharmacistRegNo] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductResult | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<BatchResult | null>(null);
  const [addQty, setAddQty] = useState(1);
  const [addDiscount, setAddDiscount] = useState(0);
  const [rxClearedLocal, setRxClearedLocal] = useState(false);
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentMode, setPaymentMode] = useState<"cash" | "upi" | "card" | "credit" | "mixed">("cash");
  const [paymentRef, setPaymentRef] = useState("");
  const [confirmedBillNo, setConfirmedBillNo] = useState<string | null>(null);
  const [showBillDialog, setShowBillDialog] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);

  // ─── Queries ────────────────────────────────────────────────────────────────
  const searchProducts = trpc.sales.searchProducts.useQuery(
    { query: searchQuery, storeId: DEFAULT_STORE_ID },
    { enabled: searchQuery.length >= 2 }
  );

  const fefoBatches = trpc.sales.getFefoBatches.useQuery(
    { productId: String(selectedProduct?.id ?? ""), storeId: DEFAULT_STORE_ID, qtyNeeded: addQty },
    { enabled: !!selectedProduct }
  );

  const getDraft = trpc.sales.getDraft.useQuery(
    { saleId: saleId ?? "" },
    { enabled: !!saleId }
  );

  const trpcUtils = trpc.useUtils();

  // ─── Mutations ──────────────────────────────────────────────────────────────
  const createDraft = trpc.sales.createDraft.useMutation({
    onSuccess: (data) => {
      setSaleId(data.id);
      setBillNo(data.billNo);
      toast.success(`Bill ${data.billNo} started`);
    },
    onError: (e) => toast.error(e.message),
  });

  const addLine = trpc.sales.addLine.useMutation({
    onSuccess: () => {
      getDraft.refetch();
      setShowBatchDialog(false);
      setSelectedProduct(null);
      setSelectedBatch(null);
      setAddQty(1);
      setAddDiscount(0);
      setRxClearedLocal(false);
      setSearchQuery("");
      toast.success("Item added");
      barcodeRef.current?.focus();
    },
    onError: (e) => toast.error(e.message),
  });

  const removeLine = trpc.sales.removeLine.useMutation({
    onSuccess: () => { getDraft.refetch(); toast.success("Item removed"); },
    onError: (e) => toast.error(e.message),
  });

  const confirmSale = trpc.sales.confirmSale.useMutation({
    onSuccess: (data) => {
      setConfirmedBillNo(data.billNo);
      setShowPaymentDialog(false);
      setShowBillDialog(true);
      toast.success(`Bill ${data.billNo} confirmed — ₹${data.total}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const cancelDraft = trpc.sales.cancelDraft.useMutation({
    onSuccess: () => {
      resetBill();
      toast.info("Bill cancelled");
    },
    onError: (e) => toast.error(e.message),
  });

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const resetBill = useCallback(() => {
    setSaleId(null);
    setBillNo(null);
    setCart([]);
    setCustomerMobile("");
    setCustomerName("");
    setSalesmanCode("");
    setPharmacistCode("");
    setPharmacistName("");
    setPharmacistRegNo("");
    setSearchQuery("");
    setBarcodeInput("");
    setConfirmedBillNo(null);
    barcodeRef.current?.focus();
  }, []);

  const ensureDraft = useCallback(async () => {
    if (saleId) return saleId;
    const result = await createDraft.mutateAsync({
      storeId: DEFAULT_STORE_ID,
      saleType: "counter",
      customerMobile: customerMobile || undefined,
      customerName: customerName || undefined,
      salesmanCode: salesmanCode || undefined,
      pharmacistCode: pharmacistCode || undefined,
      pharmacistName: pharmacistName || undefined,
      pharmacistRegNo: pharmacistRegNo || undefined,
    });
    return result.id;
  }, [saleId, customerMobile, customerName, salesmanCode, pharmacistCode, pharmacistName, pharmacistRegNo, createDraft]);

  const handleSelectProduct = (product: ProductResult) => {
    setSelectedProduct(product);
    setShowBatchDialog(true);
    setSearchQuery("");
  };

  const handleBarcodeScan = async (barcode: string): Promise<BarcodeResolvedResult> => {
    setBarcodeInput(barcode);
    const resolved = await trpcUtils.sales.scanBarcodeForSale.fetch({ barcode, storeId: Number(DEFAULT_STORE_ID) }) as BarcodeResolvedResult | undefined;
    const rows = resolved?.rows ?? [];
    const firstRow = rows[0] as { name?: string; productId?: number; canonicalAvailability?: unknown } | undefined;
    const result: BarcodeResolvedResult = {
      ...resolved,
      rows,
      canonicalAvailability: firstRow?.canonicalAvailability as BarcodeResolvedResult["canonicalAvailability"],
      status: rows.length === 0 ? "not_found" : rows.length > 1 ? "ambiguous" : firstRow?.productId ? "found" : "incomplete_master",
      message: rows.length === 0 ? "Lookup only: no stock changed." : "Lookup only: add item through confirmed billing flow.",
    };
    setScanResult(result);
    if (firstRow?.name) setSearchQuery(firstRow.name);
    else setSearchQuery(barcode);
    setBarcodeInput("");
    return result;
  };

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    void handleBarcodeScan(barcodeInput.trim()).catch((error) => toast.error(error.message));
  };

  const handleAddToCart = async () => {
    if (!selectedProduct) return;
    const isRx = selectedProduct.scheduleCode && RX_SCHEDULES.includes(selectedProduct.scheduleCode);
    if (isRx && !rxClearedLocal) {
      toast.error(`Schedule ${selectedProduct.scheduleCode} requires pharmacist clearance`);
      return;
    }
    const currentSaleId = await ensureDraft();
    const batch = selectedBatch;
    await addLine.mutateAsync({
      saleId: currentSaleId,
      productId: String(selectedProduct.id),
      batchLedgerId: batch ? String(batch.id) : undefined,
      batchNo: batch?.batchNo ?? undefined,
      expiryDate: batch?.expiryDate ?? undefined,
      mrp: batch ? parseFloat(batch.mrp ?? "0") : 0,
      saleRate: batch ? parseFloat(batch.saleRate ?? batch.mrp ?? "0") : 0,
      qty: addQty,
      discountPct: addDiscount,
      gstRate: parseFloat(selectedProduct.gstRate ?? "0"),
      hsnCode: selectedProduct.hsnCode ?? undefined,
      requiresPrescription: !!selectedProduct.requiresPrescription,
      scheduleCode: selectedProduct.scheduleCode ?? undefined,
      rxCleared: rxClearedLocal,
    });
  };

  const handleConfirm = async () => {
    if (!saleId) return;
    await confirmSale.mutateAsync({
      saleId,
      paymentMode,
      paymentRef: paymentRef || undefined,
      pharmacistCode: pharmacistCode || undefined,
      pharmacistName: pharmacistName || undefined,
      pharmacistRegNo: pharmacistRegNo || undefined,
    });
  };

  const handlePrint = () => {
    window.print();
  };

  // ─── Derived totals ─────────────────────────────────────────────────────────
  const draftData = getDraft.data;
  const lines = draftData?.lines ?? [];
  const subtotal = lines.reduce((s, l) => s + parseFloat(l.line.saleRate ?? "0") * l.line.qty, 0);
  const totalDiscount = lines.reduce((s, l) => s + parseFloat(l.line.discountAmount ?? "0"), 0);
  const totalGst = lines.reduce((s, l) => s + parseFloat(l.line.gstAmount ?? "0"), 0);
  const total = lines.reduce((s, l) => s + parseFloat(l.line.lineTotal ?? "0"), 0);
  const hasRxUncleared = lines.some(l => l.line.requiresPrescription && !l.line.rxCleared);

  const expiryBadge = (daysToExpiry: number | null) => {
    if (daysToExpiry === null) return null;
    if (daysToExpiry <= 0) return <Badge variant="destructive">EXPIRED</Badge>;
    if (daysToExpiry <= 30) return <Badge variant="destructive">{daysToExpiry}d</Badge>;
    if (daysToExpiry <= 60) return <Badge className="bg-orange-500 text-white">{daysToExpiry}d</Badge>;
    if (daysToExpiry <= 90) return <Badge className="bg-yellow-500 text-black">{daysToExpiry}d</Badge>;
    return null;
  };

  // ─── Render ─────────────────────────────────────────────name────────────────
  return (
    <AdminLayout>
      <div className="flex h-[calc(100vh-4rem)] gap-4 p-4 overflow-hidden">
        {/* ── Left: Product Search + Cart ─────────────────────────────────── */}
        <div className="flex flex-col flex-1 min-w-0 gap-4 overflow-hidden">
          {/* Bill header */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <h1 className="text-xl font-bold">Counter Billing</h1>
              {billNo && <p className="text-sm text-muted-foreground">Bill: <span className="font-mono font-semibold">{billNo}</span></p>}
            </div>
            {saleId && (
              <Button variant="outline" size="sm" onClick={() => cancelDraft.mutate({ saleId })}>
                <X className="h-4 w-4 mr-1" /> Cancel Bill
              </Button>
            )}
          </div>

          {/* Customer + Staff */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input placeholder="Customer mobile" value={customerMobile} onChange={e => setCustomerMobile(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input placeholder="Customer name (optional)" value={customerName} onChange={e => setCustomerName(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>

          {/* Barcode + Search */}
          <div className="space-y-2">
            <BarcodeScannerInput
              label="Counter barcode lookup"
              lastScannedValue={barcodeInput}
              result={scanResult}
              onScan={handleBarcodeScan}
              onError={(error) => toast.error(error.message)}
            />
            <div className="flex gap-2">
              <form onSubmit={handleBarcodeSubmit} className="flex gap-2 flex-1">
                <div className="relative flex-1">
                  <Barcode className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
                  <Input
                    ref={barcodeRef}
                    placeholder="Legacy scan/search fallback..."
                    value={barcodeInput}
                    onChange={e => setBarcodeInput(e.target.value)}
                    className="pl-8 h-9"
                    autoFocus
                  />
                </div>
                <Button type="submit" size="sm" variant="outline">
                  <Search className="h-4 w-4" />
                </Button>
              </form>
              <div className="relative flex-1">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search product..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
            </div>
          </div>

          {/* Search Results */}
          {searchQuery.length >= 2 && (
            <div className="border rounded-lg overflow-auto max-h-48 bg-background shadow-md z-10">
              {searchProducts.isLoading && <p className="p-3 text-sm text-muted-foreground">Searching...</p>}
              {searchProducts.data?.rows.length === 0 && <p className="p-3 text-sm text-muted-foreground">No products found</p>}
              {searchProducts.data?.rows.map(p => (
                <button
                  key={p.id}
                  className="w-full text-left px-3 py-2 hover:bg-muted flex items-center justify-between text-sm border-b last:border-0"
                  onClick={() => handleSelectProduct({ ...p, scheduleCode: p.scheduleId ?? null, requiresPrescription: p.prescriptionRequired ?? false } as unknown as ProductResult)}
                >
                  <div>
                    <span className="font-medium">{p.name}</span>
                    {p.brand && <span className="text-muted-foreground ml-2">{p.brand}</span>}
                    {p.strength && <span className="text-muted-foreground ml-1">· {p.strength}</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    {p.scheduleId && <Badge variant="outline" className="text-xs">{p.scheduleId}</Badge>}
                    {p.prescriptionRequired && <ShieldAlert className="h-3 w-3 text-orange-500" />}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Cart Lines */}
          <div className="flex-1 overflow-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2">Product</th>
                  <th className="text-left px-3 py-2">Batch</th>
                  <th className="text-right px-3 py-2">MRP</th>
                  <th className="text-right px-3 py-2">Rate</th>
                  <th className="text-right px-3 py-2">Qty</th>
                  <th className="text-right px-3 py-2">Disc%</th>
                  <th className="text-right px-3 py-2">Total</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">No items added yet. Scan or search a product.</td></tr>
                )}
                {lines.map((l, i) => (
                  <tr key={l.line.id} className={`border-b ${l.line.requiresPrescription && !l.line.rxCleared ? "bg-orange-50 dark:bg-orange-950/20" : ""}`}>
                    <td className="px-3 py-2">
                      <div className="font-medium">{l.productName}</div>
                      <div className="text-xs text-muted-foreground">{l.productBrand}</div>
                      {l.line.scheduleCode && <Badge variant="outline" className="text-xs mt-0.5">{l.line.scheduleCode}</Badge>}
                      {l.line.requiresPrescription && !l.line.rxCleared && (
                        <Badge variant="destructive" className="text-xs mt-0.5 ml-1">Rx Pending</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      <div>{l.line.batchNo ?? "—"}</div>
                      {l.line.expiryDate && (
                        <div className="text-muted-foreground">
                          {new Date(l.line.expiryDate).toLocaleDateString("en-IN", { month: "short", year: "2-digit" })}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">₹{parseFloat(l.line.mrp ?? "0").toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">₹{parseFloat(l.line.saleRate ?? "0").toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">{l.line.qty}</td>
                    <td className="px-3 py-2 text-right">{parseFloat(l.line.discountPct ?? "0").toFixed(1)}%</td>
                    <td className="px-3 py-2 text-right font-semibold">₹{parseFloat(l.line.lineTotal ?? "0").toFixed(2)}</td>
                    <td className="px-2 py-2">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                        onClick={() => saleId && removeLine.mutate({ saleId, lineId: l.line.id })}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Right: Bill Summary ──────────────────────────────────────────── */}
        <div className="w-72 flex flex-col gap-3 shrink-0">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Bill Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>₹{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span className="text-green-600">-₹{totalDiscount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">GST</span>
                <span>₹{totalGst.toFixed(2)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-bold text-base">
                <span>Total</span>
                <span>₹{total.toFixed(2)}</span>
              </div>
              <div className="text-xs text-muted-foreground">{lines.length} item(s)</div>
            </CardContent>
          </Card>

          {hasRxUncleared && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 text-sm">
              <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-orange-700 dark:text-orange-300">Rx Clearance Required</p>
                <p className="text-xs text-orange-600 dark:text-orange-400">Some items need pharmacist clearance before billing.</p>
              </div>
            </div>
          )}

          {/* Pharmacist */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Pharmacist</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Input placeholder="Pharmacist code" value={pharmacistCode} onChange={e => setPharmacistCode(e.target.value)} className="h-8 text-sm" />
              <Input placeholder="Pharmacist name" value={pharmacistName} onChange={e => setPharmacistName(e.target.value)} className="h-8 text-sm" />
              <Input placeholder="Reg. No." value={pharmacistRegNo} onChange={e => setPharmacistRegNo(e.target.value)} className="h-8 text-sm" />
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="space-y-2">
            <Button
              className="w-full"
              disabled={lines.length === 0 || hasRxUncleared || confirmSale.isPending}
              onClick={() => setShowPaymentDialog(true)}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Proceed to Payment
            </Button>
            <Button variant="outline" className="w-full" onClick={resetBill}>
              New Bill
            </Button>
          </div>
        </div>
      </div>

      {/* ── Batch Selection Dialog ───────────────────────────────────────────── */}
      <Dialog open={showBatchDialog} onOpenChange={setShowBatchDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedProduct?.name}
              {selectedProduct?.scheduleCode && (
                <Badge variant="outline" className="ml-2">{selectedProduct.scheduleCode}</Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedProduct && RX_SCHEDULES.includes(selectedProduct.scheduleCode ?? "") && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200">
              <ShieldAlert className="h-5 w-5 text-orange-500 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-orange-700 dark:text-orange-300">
                  Schedule {selectedProduct.scheduleCode} — Pharmacist Clearance Required
                </p>
              </div>
              <Button
                size="sm"
                variant={rxClearedLocal ? "default" : "outline"}
                onClick={() => setRxClearedLocal(!rxClearedLocal)}
                className={rxClearedLocal ? "bg-green-600 hover:bg-green-700" : ""}
              >
                {rxClearedLocal ? "✓ Cleared" : "Mark Cleared"}
              </Button>
            </div>
          )}

          <div className="space-y-3">
            <h4 className="text-sm font-medium">Available Batches (FEFO order)</h4>
            {fefoBatches.isLoading && <p className="text-sm text-muted-foreground">Loading batches...</p>}
            {fefoBatches.data?.batches.length === 0 && (
              <p className="text-sm text-muted-foreground">No stock available for this product at this store.</p>
            )}
            <div className="space-y-2 max-h-64 overflow-auto">
              {fefoBatches.data?.batches.map(b => (
                <button
                  key={b.id}
                  className={`w-full text-left p-3 rounded-lg border text-sm transition-colors ${
                    selectedBatch?.id === b.id
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted"
                  } ${b.isExpired ? "opacity-50 cursor-not-allowed" : ""}`}
                  onClick={() => !b.isExpired && setSelectedBatch(b as unknown as BatchResult)}
                  disabled={b.isExpired}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono font-medium">{b.batchNo}</span>
                      {b.expiryDate && (
                        <span className="text-muted-foreground ml-2">
                          Exp: {new Date(b.expiryDate).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {expiryBadge(b.daysToExpiry)}
                      <span className="text-muted-foreground">Avail: {b.availableQty}</span>
                    </div>
                  </div>
                  <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                    <span>MRP: ₹{parseFloat(b.mrp ?? "0").toFixed(2)}</span>
                    <span>Rate: ₹{parseFloat(b.saleRate ?? b.mrp ?? "0").toFixed(2)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Quantity</Label>
              <Input
                type="number" min={1} max={selectedBatch?.availableQty ?? 999}
                value={addQty} onChange={e => setAddQty(parseInt(e.target.value) || 1)}
                className="h-8 mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Discount %</Label>
              <Input
                type="number" min={0} max={100} step={0.5}
                value={addDiscount} onChange={e => setAddDiscount(parseFloat(e.target.value) || 0)}
                className="h-8 mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBatchDialog(false)}>Cancel</Button>
            <Button
              onClick={handleAddToCart}
              disabled={addLine.isPending || (RX_SCHEDULES.includes(selectedProduct?.scheduleCode ?? "") && !rxClearedLocal)}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add to Bill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Payment Dialog ───────────────────────────────────────────────────── */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Collect Payment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-3xl font-bold">₹{total.toFixed(2)}</p>
              <p className="text-sm text-muted-foreground">{lines.length} item(s)</p>
            </div>
            <div>
              <Label>Payment Mode</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {(["cash", "upi", "card", "credit"] as const).map(mode => (
                  <Button
                    key={mode}
                    variant={paymentMode === mode ? "default" : "outline"}
                    className="capitalize"
                    onClick={() => setPaymentMode(mode)}
                  >
                    {mode === "cash" && <Banknote className="h-4 w-4 mr-1" />}
                    {mode === "upi" && <Smartphone className="h-4 w-4 mr-1" />}
                    {mode === "card" && <CreditCard className="h-4 w-4 mr-1" />}
                    {mode}
                  </Button>
                ))}
              </div>
            </div>
            {(paymentMode === "upi" || paymentMode === "card") && (
              <div>
                <Label>Payment Reference / UTR</Label>
                <Input placeholder="UPI ref / card last 4" value={paymentRef} onChange={e => setPaymentRef(e.target.value)} className="mt-1" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>Back</Button>
            <Button onClick={handleConfirm} disabled={confirmSale.isPending}>
              <CheckCircle className="h-4 w-4 mr-1" />
              Confirm & Bill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bill Confirmed Dialog ─────────────────────────────────────────────── */}
      <Dialog open={showBillDialog} onOpenChange={setShowBillDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Bill Confirmed</DialogTitle></DialogHeader>
          <div className="text-center space-y-4 py-4">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
            <div>
              <p className="text-2xl font-bold">{confirmedBillNo}</p>
              <p className="text-muted-foreground">₹{total.toFixed(2)} · {paymentMode.toUpperCase()}</p>
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-1" /> Print Bill
            </Button>
            <Button variant="outline">
              <Smartphone className="h-4 w-4 mr-1" /> WhatsApp (coming soon)
            </Button>
            <Button onClick={() => { setShowBillDialog(false); resetBill(); }}>
              Next Sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
