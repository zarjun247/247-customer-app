import { AdminLayout } from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useRef } from "react";
import { Barcode, Plus, Minus, Trash2, Printer, ShoppingCart, Search, CreditCard, Banknote, Smartphone } from "lucide-react";
import { toast } from "sonner";

type SaleLine = {
  productId: number;
  productName: string;
  batchNumber: string;
  expiryDate: string;
  mrp: number;
  qty: number;
  discount: number;
  gstRate: number;
};

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "upi", label: "UPI", icon: Smartphone },
  { value: "card", label: "Card", icon: CreditCard },
];

export default function CounterSale() {
  const [barcode, setBarcode] = useState("");
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [cashTendered, setCashTendered] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const barcodeRef = useRef<HTMLInputElement>(null);

  const searchProducts = trpc.catalog.list.useQuery(
    { search: barcode, limit: 8 },
    { enabled: barcode.length >= 3 }
  );

  function addProduct(product: any) {
    const existing = lines.findIndex(l => l.productId === product.id);
    if (existing >= 0) {
      setLines(prev => prev.map((l, i) => i === existing ? { ...l, qty: l.qty + 1 } : l));
    } else {
      setLines(prev => [...prev, {
        productId: product.id,
        productName: product.name,
        batchNumber: product.batchNumber ?? "AUTO",
        expiryDate: product.expiryDate ?? "",
        mrp: Number(product.mrp ?? product.price ?? 0),
        qty: 1,
        discount: 0,
        gstRate: Number(product.gstRate ?? 12),
      }]);
    }
    setBarcode("");
    barcodeRef.current?.focus();
  }

  function updateQty(idx: number, delta: number) {
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const newQty = l.qty + delta;
      return newQty <= 0 ? l : { ...l, qty: newQty };
    }));
  }

  function removeLine(idx: number) {
    setLines(prev => prev.filter((_, i) => i !== idx));
  }

  function updateDiscount(idx: number, val: string) {
    const d = parseFloat(val) || 0;
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, discount: Math.min(d, 100) } : l));
  }

  const subtotal = lines.reduce((sum, l) => sum + l.mrp * l.qty * (1 - l.discount / 100), 0);
  const gstTotal = lines.reduce((sum, l) => {
    const base = l.mrp * l.qty * (1 - l.discount / 100);
    const gstAmt = base - base / (1 + l.gstRate / 100);
    return sum + gstAmt;
  }, 0);
  const total = subtotal;
  const change = parseFloat(cashTendered) - total;

  function printBill() {
    const win = window.open("", "_blank");
    if (!win) return;
    const rows = lines.map(l => {
      const lineTotal = l.mrp * l.qty * (1 - l.discount / 100);
      return `<tr>
        <td>${l.productName}</td>
        <td>${l.batchNumber}</td>
        <td>${l.qty}</td>
        <td>₹${l.mrp.toFixed(2)}</td>
        <td>${l.discount}%</td>
        <td>₹${lineTotal.toFixed(2)}</td>
      </tr>`;
    }).join("");
    win.document.write(`<!DOCTYPE html>
<html><head><title>Sale Bill</title>
<style>
  body { font-family: monospace; font-size: 12px; max-width: 300px; margin: 0 auto; padding: 8px; }
  h2 { text-align: center; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #ccc; padding: 3px 2px; text-align: left; font-size: 11px; }
  .total { font-weight: bold; font-size: 13px; }
  .footer { text-align: center; margin-top: 8px; font-size: 10px; }
</style></head><body>
<h2>247 Pharmacy</h2>
<p style="text-align:center;font-size:10px">${new Date().toLocaleString()}</p>
<table>
  <thead><tr><th>Item</th><th>Batch</th><th>Qty</th><th>MRP</th><th>Disc</th><th>Total</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<hr/>
<p class="total">Subtotal: ₹${subtotal.toFixed(2)}</p>
<p>GST: ₹${gstTotal.toFixed(2)}</p>
<p class="total">Grand Total: ₹${total.toFixed(2)}</p>
${paymentMethod === "cash" && cashTendered ? `<p>Cash: ₹${parseFloat(cashTendered).toFixed(2)}</p><p>Change: ₹${change.toFixed(2)}</p>` : ""}
<p>Payment: ${paymentMethod.toUpperCase()}</p>
<p class="footer">Thank you for your purchase!<br/>24/7 Pharmacy — Licensed Dispensary</p>
</body></html>`);
    win.print();
  }

  function completeSale() {
    if (lines.length === 0) { toast.error("Add items to the sale first"); return; }
    if (paymentMethod === "cash" && parseFloat(cashTendered) < total) {
      toast.error("Cash tendered is less than total"); return;
    }
    printBill();
    toast.success(`Sale completed — ₹${total.toFixed(2)}`);
    setLines([]);
    setBarcode("");
    setCashTendered("");
    setCustomerPhone("");
    barcodeRef.current?.focus();
  }

  return (
    <AdminLayout>
      <div className="p-4 h-[calc(100vh-64px)] flex gap-4">
        {/* Left: item entry */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {/* Barcode / search */}
          <div className="bg-zinc-900 border border-white/5 rounded-xl p-4">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Barcode / Search</p>
            <div className="relative">
              <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                ref={barcodeRef}
                autoFocus
                value={barcode}
                onChange={e => setBarcode(e.target.value)}
                placeholder="Scan barcode or type product name..."
                className="pl-10 bg-zinc-800 border-white/10 text-zinc-100"
              />
            </div>
            {barcode.length >= 3 && searchProducts.data && searchProducts.data.length > 0 && (
              <div className="mt-2 border border-white/10 rounded-lg overflow-hidden">
                {searchProducts.data.map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() => addProduct(p)}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-white/5 border-b border-white/5 last:border-0 text-left"
                  >
                    <div>
                      <p className="text-zinc-200">{p.name}</p>
                      <p className="text-xs text-zinc-500">{p.manufacturer ?? ""}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-zinc-300 font-medium">₹{Number(p.mrp ?? p.price ?? 0).toFixed(2)}</p>
                      <p className="text-xs text-zinc-500">GST {p.gstRate ?? 12}%</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sale lines */}
          <div className="flex-1 bg-zinc-900 border border-white/5 rounded-xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-white/5">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Sale Lines</p>
            </div>
            {lines.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <ShoppingCart className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                  <p className="text-sm text-zinc-600">Scan or search to add items</p>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5 bg-zinc-900/50">
                      <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Product</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Batch</th>
                      <th className="text-center px-3 py-2 text-xs font-medium text-zinc-500">Qty</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-zinc-500">MRP</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-zinc-500">Disc%</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-zinc-500">Total</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, idx) => {
                      const lineTotal = line.mrp * line.qty * (1 - line.discount / 100);
                      return (
                        <tr key={idx} className="border-b border-white/5">
                          <td className="px-3 py-2 text-zinc-200 max-w-[160px] truncate">{line.productName}</td>
                          <td className="px-3 py-2 text-zinc-500 font-mono text-xs">{line.batchNumber}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => updateQty(idx, -1)} className="w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center">
                                <Minus className="w-3 h-3 text-zinc-400" />
                              </button>
                              <span className="w-8 text-center text-zinc-200">{line.qty}</span>
                              <button onClick={() => updateQty(idx, 1)} className="w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center">
                                <Plus className="w-3 h-3 text-zinc-400" />
                              </button>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right text-zinc-300">₹{line.mrp.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              value={line.discount}
                              onChange={e => updateDiscount(idx, e.target.value)}
                              className="w-16 h-7 text-xs text-right bg-zinc-800 border-white/10 px-1"
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-zinc-200">₹{lineTotal.toFixed(2)}</td>
                          <td className="px-3 py-2">
                            <button onClick={() => removeLine(idx)} className="text-zinc-600 hover:text-red-400">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right: payment panel */}
        <div className="w-72 flex flex-col gap-3">
          <div className="bg-zinc-900 border border-white/5 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Customer</p>
            <Input
              value={customerPhone}
              onChange={e => setCustomerPhone(e.target.value)}
              placeholder="Phone (optional)"
              className="bg-zinc-800 border-white/10 text-sm"
            />
          </div>

          <div className="bg-zinc-900 border border-white/5 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Payment</p>
            <div className="grid grid-cols-3 gap-1.5">
              {PAYMENT_METHODS.map(m => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.value}
                    onClick={() => setPaymentMethod(m.value)}
                    className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-xs transition-colors ${
                      paymentMethod === m.value
                        ? "border-blue-500 bg-blue-500/10 text-blue-400"
                        : "border-white/10 text-zinc-500 hover:border-white/20"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {m.label}
                  </button>
                );
              })}
            </div>
            {paymentMethod === "cash" && (
              <div>
                <p className="text-xs text-zinc-500 mb-1">Cash tendered</p>
                <Input
                  type="number"
                  value={cashTendered}
                  onChange={e => setCashTendered(e.target.value)}
                  placeholder="0.00"
                  className="bg-zinc-800 border-white/10 text-lg font-bold text-right"
                />
                {cashTendered && change >= 0 && (
                  <p className="text-sm text-green-400 mt-1 text-right">Change: ₹{change.toFixed(2)}</p>
                )}
              </div>
            )}
          </div>

          <div className="bg-zinc-900 border border-white/5 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm text-zinc-400">
              <span>Subtotal</span>
              <span>₹{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-zinc-500">
              <span>GST (incl.)</span>
              <span>₹{gstTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-zinc-100 border-t border-white/10 pt-2">
              <span>Total</span>
              <span>₹{total.toFixed(2)}</span>
            </div>
          </div>

          <Button
            onClick={completeSale}
            disabled={lines.length === 0}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold h-12 text-base gap-2"
          >
            <Printer className="w-4 h-4" />
            Complete & Print Bill
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}
