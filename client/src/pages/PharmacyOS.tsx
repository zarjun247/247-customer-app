/**
 * PharmacyOS.tsx
 * Internal Pharmacy Operations System — visible to store_manager | admin
 * Tabs: Inventory / FEFO Alerts / GRN Receive / Vendor & PO / Staff / Rider Ops
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Package, AlertTriangle, Truck, Users, ShieldCheck, RefreshCw,
  Building2, ClipboardList, Bike, TrendingUp,
} from "lucide-react";

const TABS = [
  { id: "fefo", label: "FEFO Alerts", icon: AlertTriangle },
  { id: "grn", label: "Receive GRN", icon: Package },
  { id: "vendor", label: "Vendors & PO", icon: Building2 },
  { id: "staff", label: "Staff", icon: Users },
  { id: "rider", label: "Rider Ops", icon: Bike },
] as const;

type Tab = typeof TABS[number]["id"];

// ─── FEFO Alerts Tab ──────────────────────────────────────────────────────────

function FefoTab() {
  const { data: alerts = [], isLoading, refetch } = trpc.inventory.fefoAlerts.useQuery();
  const { data: stockouts = [] } = trpc.inventory.stockouts.useQuery();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Expiry & Stockout Alerts</h2>
        <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-8 w-8 p-0">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {stockouts.length > 0 && (
        <div>
          <p className="text-xs font-medium text-red-400 mb-2">Stockouts ({stockouts.length})</p>
          <div className="space-y-2">
            {stockouts.map((s: { skuId: number; productId: number; productName: string; stockQty: number; softLockedQty: number }) => (
              <div key={s.skuId} className="flex items-center justify-between px-3 py-2 rounded-md bg-red-500/10 border border-red-500/20">
                <div>
                  <p className="text-sm font-medium">{s.productName}</p>
                  <p className="text-xs text-muted-foreground">SKU #{s.skuId} · Stock: {s.stockQty}</p>
                </div>
                <Badge variant="outline" className="text-xs text-red-400 border-red-500/30">Out of stock</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-medium text-amber-400 mb-2">Expiring within 90 days ({alerts.length})</p>
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-primary" />
          </div>
        ) : alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">No expiry alerts — all batches are within safe range.</p>
        ) : (
          <div className="space-y-2">
            {alerts.map((a: { batchId: number; batchNumber: string; expiryDate: Date; quantity: number; daysUntilExpiry: number; productName: string; severity: string }) => (
              <div key={a.batchId} className="flex items-center justify-between px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/20">
                <div>
                  <p className="text-sm font-medium">{a.productName ?? `Batch ${a.batchNumber}`}</p>
                  <p className="text-xs text-muted-foreground">
                    Batch: {a.batchNumber} · Qty: {a.quantity} · Expires: {new Date(a.expiryDate).toLocaleDateString()}
                  </p>
                </div>
                <Badge variant="outline" className={`text-xs ${a.daysUntilExpiry <= 30 ? "text-red-400 border-red-500/30" : "text-amber-400 border-amber-500/30"}`}>
                  {a.daysUntilExpiry}d left
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── GRN Receive Tab ──────────────────────────────────────────────────────────

function GrnTab() {
  const [items, setItems] = useState([{
    productId: "", variantId: "", batchNumber: "", expiryDate: "", quantity: "", unitCost: "",
  }]);
  const [poId, setPoId] = useState("");
  const [notes, setNotes] = useState("");

  const receiveGrn = trpc.inventory.receiveGrn.useMutation({
    onSuccess: () => { toast.success("GRN received and batches created"); setItems([{ productId: "", variantId: "", batchNumber: "", expiryDate: "", quantity: "", unitCost: "" }]); setPoId(""); setNotes(""); },
    onError: (e) => toast.error(e.message),
  });

  function addItem() {
    setItems(prev => [...prev, { productId: "", variantId: "", batchNumber: "", expiryDate: "", quantity: "", unitCost: "" }]);
  }

  function updateItem(idx: number, field: string, value: string) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  function handleSubmit() {
    const parsed = items.map(item => ({
      productId: parseInt(item.productId, 10),
      variantId: item.variantId ? parseInt(item.variantId, 10) : undefined,
      batchNumber: item.batchNumber,
      expiryDate: new Date(item.expiryDate),
      quantity: parseInt(item.quantity, 10),
      unitCost: item.unitCost ? parseFloat(item.unitCost) : undefined,
    }));
    if (parsed.some(p => isNaN(p.productId) || !p.batchNumber || !p.expiryDate || isNaN(p.quantity))) {
      toast.error("Please fill all required fields for each item");
      return;
    }
    receiveGrn.mutate({
      poId: poId ? parseInt(poId, 10) : undefined,
      notes: notes || undefined,
      items: parsed,
    });
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-medium text-muted-foreground">Receive Goods (GRN)</h2>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">PO ID (optional)</label>
          <Input value={poId} onChange={e => setPoId(e.target.value)} placeholder="PO #" className="h-8 text-sm bg-muted/30 border-border/40" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
          <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" className="h-8 text-sm bg-muted/30 border-border/40" />
        </div>
      </div>

      <div className="space-y-3">
        {items.map((item, idx) => (
          <div key={idx} className="p-3 rounded-md border border-border/40 bg-card/40 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Item {idx + 1}</p>
              {items.length > 1 && (
                <Button variant="ghost" size="sm" className="h-6 text-xs text-red-400 hover:text-red-300" onClick={() => removeItem(idx)}>Remove</Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Product ID *</label>
                <Input value={item.productId} onChange={e => updateItem(idx, "productId", e.target.value)} placeholder="Product ID" className="h-8 text-sm bg-muted/30 border-border/40" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Variant ID</label>
                <Input value={item.variantId} onChange={e => updateItem(idx, "variantId", e.target.value)} placeholder="Optional" className="h-8 text-sm bg-muted/30 border-border/40" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Batch # *</label>
                <Input value={item.batchNumber} onChange={e => updateItem(idx, "batchNumber", e.target.value)} placeholder="Batch number" className="h-8 text-sm bg-muted/30 border-border/40" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Expiry Date *</label>
                <Input type="date" value={item.expiryDate} onChange={e => updateItem(idx, "expiryDate", e.target.value)} className="h-8 text-sm bg-muted/30 border-border/40" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Quantity *</label>
                <Input type="number" value={item.quantity} onChange={e => updateItem(idx, "quantity", e.target.value)} placeholder="Qty" className="h-8 text-sm bg-muted/30 border-border/40" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Unit Cost (₹)</label>
                <Input type="number" step="0.01" value={item.unitCost} onChange={e => updateItem(idx, "unitCost", e.target.value)} placeholder="Optional" className="h-8 text-sm bg-muted/30 border-border/40" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={addItem} className="text-xs">+ Add Item</Button>
        <Button size="sm" onClick={handleSubmit} disabled={receiveGrn.isPending} className="text-xs">
          {receiveGrn.isPending ? "Receiving..." : "Receive GRN"}
        </Button>
      </div>
    </div>
  );
}

// ─── Vendor & PO Tab ──────────────────────────────────────────────────────────

function VendorTab() {
  const [showNewVendor, setShowNewVendor] = useState(false);
  const [vendorName, setVendorName] = useState("");
  const [vendorPhone, setVendorPhone] = useState("");
  const [showNewPO, setShowNewPO] = useState(false);
  const [poVendorId, setPoVendorId] = useState("");
  const [poItems, setPoItems] = useState([{ productId: "", orderedQty: "", unitCost: "" }]);

  const { data: vendors = [], refetch: refetchVendors } = trpc.vendor.list.useQuery();
  const { data: pos = [], refetch: refetchPOs } = trpc.vendor.listPOs.useQuery();

  const createVendor = trpc.vendor.create.useMutation({
    onSuccess: () => { toast.success("Vendor created"); setShowNewVendor(false); setVendorName(""); setVendorPhone(""); refetchVendors(); },
    onError: (e) => toast.error(e.message),
  });

  const createPO = trpc.vendor.createPO.useMutation({
    onSuccess: () => { toast.success("Purchase order created"); setShowNewPO(false); setPoVendorId(""); setPoItems([{ productId: "", orderedQty: "", unitCost: "" }]); refetchPOs(); },
    onError: (e) => toast.error(e.message),
  });

  function handleCreatePO() {
    const items = poItems.map(i => ({
      productId: parseInt(i.productId, 10),
      orderedQty: parseInt(i.orderedQty, 10),
      unitCost: parseFloat(i.unitCost),
    }));
    if (!poVendorId || items.some(i => isNaN(i.productId) || isNaN(i.orderedQty) || isNaN(i.unitCost))) {
      toast.error("Fill all PO fields"); return;
    }
    createPO.mutate({ vendorId: parseInt(poVendorId, 10), items });
  }

  return (
    <div className="space-y-6">
      {/* Vendors */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-muted-foreground">Vendors ({vendors.length})</h2>
          <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setShowNewVendor(v => !v)}>
            {showNewVendor ? "Cancel" : "+ New Vendor"}
          </Button>
        </div>
        {showNewVendor && (
          <div className="p-3 rounded-md border border-border/40 bg-card/40 space-y-2 mb-3">
            <Input value={vendorName} onChange={e => setVendorName(e.target.value)} placeholder="Vendor name *" className="h-8 text-sm bg-muted/30 border-border/40" />
            <Input value={vendorPhone} onChange={e => setVendorPhone(e.target.value)} placeholder="Phone (optional)" className="h-8 text-sm bg-muted/30 border-border/40" />
            <Button size="sm" className="text-xs" onClick={() => createVendor.mutate({ name: vendorName, phone: vendorPhone || undefined })} disabled={!vendorName || createVendor.isPending}>
              {createVendor.isPending ? "Creating..." : "Create Vendor"}
            </Button>
          </div>
        )}
        <div className="space-y-2">
          {vendors.map((v: { id: number; name: string; phone?: string | null; gstin?: string | null; isActive: boolean }) => (
            <div key={v.id} className="flex items-center justify-between px-3 py-2 rounded-md bg-card/40 border border-border/40">
              <div>
                <p className="text-sm font-medium">{v.name}</p>
                {v.phone && <p className="text-xs text-muted-foreground">{v.phone}</p>}
              </div>
              <Badge variant="outline" className={`text-xs ${v.isActive ? "text-emerald-400 border-emerald-500/30" : "text-muted-foreground"}`}>
                {v.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
          ))}
        </div>
      </div>

      <Separator className="opacity-30" />

      {/* Purchase Orders */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-muted-foreground">Purchase Orders ({pos.length})</h2>
          <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setShowNewPO(v => !v)}>
            {showNewPO ? "Cancel" : "+ New PO"}
          </Button>
        </div>
        {showNewPO && (
          <div className="p-3 rounded-md border border-border/40 bg-card/40 space-y-2 mb-3">
            <Input value={poVendorId} onChange={e => setPoVendorId(e.target.value)} placeholder="Vendor ID *" className="h-8 text-sm bg-muted/30 border-border/40" />
            {poItems.map((item, idx) => (
              <div key={idx} className="grid grid-cols-3 gap-2">
                <Input value={item.productId} onChange={e => setPoItems(p => p.map((x, i) => i === idx ? { ...x, productId: e.target.value } : x))} placeholder="Product ID" className="h-8 text-sm bg-muted/30 border-border/40" />
                <Input value={item.orderedQty} onChange={e => setPoItems(p => p.map((x, i) => i === idx ? { ...x, orderedQty: e.target.value } : x))} placeholder="Qty" className="h-8 text-sm bg-muted/30 border-border/40" />
                <Input value={item.unitCost} onChange={e => setPoItems(p => p.map((x, i) => i === idx ? { ...x, unitCost: e.target.value } : x))} placeholder="Unit cost" className="h-8 text-sm bg-muted/30 border-border/40" />
              </div>
            ))}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="text-xs" onClick={() => setPoItems(p => [...p, { productId: "", orderedQty: "", unitCost: "" }])}>+ Item</Button>
              <Button size="sm" className="text-xs" onClick={handleCreatePO} disabled={createPO.isPending}>
                {createPO.isPending ? "Creating..." : "Create PO"}
              </Button>
            </div>
          </div>
        )}
        <div className="space-y-2">
          {pos.map((po: { id: number; vendorId: number; status: string; createdAt: Date }) => (
            <div key={po.id} className="flex items-center justify-between px-3 py-2 rounded-md bg-card/40 border border-border/40">
              <div>
                <p className="text-sm font-medium">PO #{po.id}</p>
                <p className="text-xs text-muted-foreground">Vendor {po.vendorId} · {new Date(po.createdAt).toLocaleDateString()}</p>
              </div>
              <Badge variant="outline" className="text-xs capitalize">{po.status}</Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Staff Tab ────────────────────────────────────────────────────────────────

function StaffTab() {
  const { data: staff = [], refetch } = trpc.staff.list.useQuery();
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<"pharmacist" | "store_manager" | "inventory_operator" | "delivery_operator" | "auditor">("pharmacist");
  const [removeId, setRemoveId] = useState<number | null>(null);

  const assign = trpc.staff.assign.useMutation({
    onSuccess: () => { toast.success("Staff assigned"); setUserId(""); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.staff.remove.useMutation({
    onSuccess: () => { toast.success("Staff removed"); setRemoveId(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-medium text-muted-foreground">Staff Assignments</h2>
      <div className="p-3 rounded-md border border-border/40 bg-card/40 space-y-2">
        <p className="text-xs text-muted-foreground">Assign a user to this store</p>
        <div className="grid grid-cols-2 gap-2">
          <Input value={userId} onChange={e => setUserId(e.target.value)} placeholder="User ID" className="h-8 text-sm bg-muted/30 border-border/40" />
          <select
            value={role}
            onChange={e => setRole(e.target.value as typeof role)}
            className="h-8 text-sm bg-muted/30 border border-border/40 rounded-md px-2 focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
          >
            <option value="pharmacist">Pharmacist</option>
            <option value="store_manager">Store Manager</option>
            <option value="inventory_operator">Inventory Operator</option>
            <option value="delivery_operator">Delivery Operator</option>
            <option value="auditor">Auditor</option>
          </select>
        </div>
        <Button size="sm" className="text-xs" onClick={() => assign.mutate({ userId: parseInt(userId, 10), role })} disabled={!userId || assign.isPending}>
          {assign.isPending ? "Assigning..." : "Assign Staff"}
        </Button>
      </div>

      <div className="space-y-2">
        {staff.map((s: { id: number; userId: number; role: string; userName?: string | null; assignedAt: Date }) => (
          <div key={s.id} className="flex items-center justify-between px-3 py-2 rounded-md bg-card/40 border border-border/40">
            <div>
              <p className="text-sm font-medium">{s.userName ?? `User ${s.userId}`}</p>
              <p className="text-xs text-muted-foreground capitalize">{s.role.replace(/_/g, " ")} · Since {new Date(s.assignedAt).toLocaleDateString()}</p>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-red-400 hover:text-red-300"
              onClick={() => { setRemoveId(s.id); remove.mutate({ assignmentId: s.id }); }}
              disabled={removeId === s.id && remove.isPending}>
              Remove
            </Button>
          </div>
        ))}
        {staff.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No staff assigned yet.</p>}
      </div>
    </div>
  );
}

// ─── Rider Ops Tab ────────────────────────────────────────────────────────────

function RiderTab() {
  const { data: riders = [], refetch } = trpc.rider.available.useQuery();
  const [orderId, setOrderId] = useState("");
  const [riderId, setRiderId] = useState("");
  const [otp, setOtp] = useState("");
  const [failedNote, setFailedNote] = useState("");
  const [failedOrderId, setFailedOrderId] = useState("");
  const [failedRiderId, setFailedRiderId] = useState("");

  const assign = trpc.rider.assign.useMutation({
    onSuccess: () => { toast.success("Rider assigned"); setOrderId(""); setRiderId(""); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const verifyOtp = trpc.rider.verifyOtp.useMutation({
    onSuccess: (data) => { toast.success(data.success ? "OTP verified — delivery confirmed" : `OTP failed: ${data.reason ?? "Invalid"}`); setOtp(""); },
    onError: (e) => toast.error(e.message),
  });
  const recordFailed = trpc.rider.recordFailed.useMutation({
    onSuccess: () => { toast.success("Failed delivery recorded"); setFailedOrderId(""); setFailedRiderId(""); setFailedNote(""); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Available Riders ({riders.length})</h2>
        <div className="space-y-2">
          {riders.map((r: { id: number; name: string; phone: string; vehicleType?: string | null }) => (
            <div key={r.id} className="flex items-center justify-between px-3 py-2 rounded-md bg-card/40 border border-border/40">
              <div>
                <p className="text-sm font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">{r.phone}{r.vehicleType ? ` · ${r.vehicleType}` : ""}</p>
              </div>
              <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/30">Available</Badge>
            </div>
          ))}
          {riders.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No riders available.</p>}
        </div>
      </div>

      <Separator className="opacity-30" />

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Assign Rider to Order</h2>
        <div className="grid grid-cols-2 gap-2">
          <Input value={orderId} onChange={e => setOrderId(e.target.value)} placeholder="Order ID" className="h-8 text-sm bg-muted/30 border-border/40" />
          <Input value={riderId} onChange={e => setRiderId(e.target.value)} placeholder="Rider ID" className="h-8 text-sm bg-muted/30 border-border/40" />
        </div>
        <Button size="sm" className="text-xs" onClick={() => assign.mutate({ orderId: parseInt(orderId, 10), riderId: parseInt(riderId, 10) })} disabled={!orderId || !riderId || assign.isPending}>
          {assign.isPending ? "Assigning..." : "Assign Rider"}
        </Button>
      </div>

      <Separator className="opacity-30" />

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Verify Delivery OTP</h2>
        <div className="grid grid-cols-2 gap-2">
          <Input value={orderId} onChange={e => setOrderId(e.target.value)} placeholder="Order ID" className="h-8 text-sm bg-muted/30 border-border/40" />
          <Input value={otp} onChange={e => setOtp(e.target.value)} placeholder="6-digit OTP" maxLength={6} className="h-8 text-sm bg-muted/30 border-border/40" />
        </div>
        <Button size="sm" className="text-xs" onClick={() => verifyOtp.mutate({ orderId: parseInt(orderId, 10), otp })} disabled={otp.length !== 6 || verifyOtp.isPending}>
          {verifyOtp.isPending ? "Verifying..." : "Verify OTP"}
        </Button>
      </div>

      <Separator className="opacity-30" />

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Record Failed Delivery</h2>
        <div className="grid grid-cols-2 gap-2">
          <Input value={failedOrderId} onChange={e => setFailedOrderId(e.target.value)} placeholder="Order ID" className="h-8 text-sm bg-muted/30 border-border/40" />
          <Input value={failedRiderId} onChange={e => setFailedRiderId(e.target.value)} placeholder="Rider ID" className="h-8 text-sm bg-muted/30 border-border/40" />
        </div>
        <Input value={failedNote} onChange={e => setFailedNote(e.target.value)} placeholder="Reason (required, min 5 chars)" className="h-8 text-sm bg-muted/30 border-border/40" />
        <Button size="sm" variant="outline" className="text-xs text-red-400 border-red-500/30 hover:bg-red-500/10"
          onClick={() => recordFailed.mutate({ orderId: parseInt(failedOrderId, 10), riderId: parseInt(failedRiderId, 10), note: failedNote })}
          disabled={failedNote.length < 5 || recordFailed.isPending}>
          {recordFailed.isPending ? "Recording..." : "Record Failed Delivery"}
        </Button>
      </div>
    </div>
  );
}

// ─── Main PharmacyOS Component ────────────────────────────────────────────────

export default function PharmacyOS() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("fefo");

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary" />
      </div>
    );
  }

  if (!user || (user.role !== "store_manager" && user.role !== "admin")) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-4">
        <ShieldCheck className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Store manager access required.</p>
        <Button variant="outline" onClick={() => navigate("/")}>Go home</Button>
      </div>
    );
  }

  const ActiveIcon = TABS.find(t => t.id === activeTab)?.icon ?? Package;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border/40 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <TrendingUp className="h-5 w-5 text-primary" />
          <div>
            <h1 className="font-semibold text-sm">Pharmacy OS</h1>
            <p className="text-xs text-muted-foreground">Operations Dashboard</p>
          </div>
        </div>
        {/* Tab bar */}
        <div className="max-w-5xl mx-auto px-4 flex gap-1 pb-0 overflow-x-auto">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {activeTab === "fefo" && <FefoTab />}
        {activeTab === "grn" && <GrnTab />}
        {activeTab === "vendor" && <VendorTab />}
        {activeTab === "staff" && <StaffTab />}
        {activeTab === "rider" && <RiderTab />}
      </div>
    </div>
  );
}
