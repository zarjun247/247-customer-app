/**
 * BarcodePrint.tsx
 * Batch label generation and print queue for pharmacy operations.
 * Generates Code 128 barcodes (via ZPL) and allows preview/download.
 * Access: store_manager | admin | pharmacist
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft, Printer, Download, Plus, Trash2, Package,
  ShieldCheck, Barcode, RefreshCw,
} from "lucide-react";

type LabelJob = {
  id: string;
  productName: string;
  batchNumber: string;
  expiryDate: string;
  mrp: string;
  barcode?: string;
  zpl?: string;
};

function generateBatchLabelZpl(params: {
  productName: string;
  batchNumber: string;
  expiryDate: string;
  mrp: string;
  barcode?: string;
}): string {
  const bc = params.barcode ?? params.batchNumber;
  return `^XA
^PW406
^LL203
^FO10,10^A0N,22,22^FD${params.productName.substring(0, 25)}^FS
^FO10,38^A0N,18,18^FDBatch: ${params.batchNumber}^FS
^FO10,60^A0N,18,18^FDExp: ${params.expiryDate}  MRP: Rs.${params.mrp}^FS
^FO10,85^BCN,70,Y,N,N^FD${bc}^FS
^XZ`;
}

function generateDispatchLabelZpl(params: {
  orderId: string;
  customerName: string;
  address: string;
  phone: string;
  items: string;
}): string {
  return `^XA
^PW812
^LL406
^FO30,20^A0N,35,35^FD24/7 Pharmacy^FS
^FO30,60^A0N,22,22^FDOrder ${params.orderId}^FS
^FO30,90^GB752,2,2^FS
^FO30,100^A0N,28,28^FD${params.customerName.substring(0, 30)}^FS
^FO30,135^A0N,20,20^FD${params.address.substring(0, 50)}^FS
^FO30,160^A0N,18,18^FDPh: ${params.phone}^FS
^FO30,185^GB752,2,2^FS
^FO30,195^A0N,18,18^FD${params.items.substring(0, 60)}^FS
^FO30,230^BCN,80,Y,N,N^FD${params.orderId}^FS
^XZ`;
}

function downloadZpl(zpl: string, filename: string) {
  const blob = new Blob([zpl], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function BarcodePrint() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  const [activeTab, setActiveTab] = useState<"batch" | "dispatch">("batch");
  const [jobs, setJobs] = useState<LabelJob[]>([]);

  // Batch label form
  const [productName, setProductName] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [mrp, setMrp] = useState("");
  const [barcode, setBarcode] = useState("");

  // Dispatch label form
  const [orderId, setOrderId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [items, setItems] = useState("");

  const ALLOWED_ROLES = ["store_manager", "admin", "pharmacist"];

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary" />
      </div>
    );
  }

  if (!user || !ALLOWED_ROLES.includes(user.role)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-4">
        <ShieldCheck className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Pharmacy staff access required.</p>
        <Button variant="outline" onClick={() => navigate("/")}>Go home</Button>
      </div>
    );
  }

  const addBatchLabel = () => {
    if (!productName || !batchNumber || !expiryDate || !mrp) {
      toast.error("Please fill in all required fields.");
      return;
    }
    const zpl = generateBatchLabelZpl({ productName, batchNumber, expiryDate, mrp, barcode: barcode || undefined });
    const job: LabelJob = {
      id: `batch-${Date.now()}`,
      productName,
      batchNumber,
      expiryDate,
      mrp,
      barcode: barcode || batchNumber,
      zpl,
    };
    setJobs(prev => [job, ...prev]);
    toast.success("Label added to print queue.");
    setProductName(""); setBatchNumber(""); setExpiryDate(""); setMrp(""); setBarcode("");
  };

  const addDispatchLabel = () => {
    if (!orderId || !customerName || !address || !phone) {
      toast.error("Please fill in all required fields.");
      return;
    }
    const zpl = generateDispatchLabelZpl({ orderId, customerName, address, phone, items });
    const job: LabelJob = {
      id: `dispatch-${Date.now()}`,
      productName: `Dispatch: ${orderId}`,
      batchNumber: orderId,
      expiryDate: "",
      mrp: "",
      barcode: orderId,
      zpl,
    };
    setJobs(prev => [job, ...prev]);
    toast.success("Dispatch label added to print queue.");
    setOrderId(""); setCustomerName(""); setAddress(""); setPhone(""); setItems("");
  };

  const removeJob = (id: string) => setJobs(prev => prev.filter(j => j.id !== id));

  const downloadAll = () => {
    if (jobs.length === 0) { toast.error("No labels in queue."); return; }
    const combined = jobs.map(j => j.zpl ?? "").join("\n");
    downloadZpl(combined, `labels-${Date.now()}.zpl`);
    toast.success(`Downloaded ${jobs.length} label${jobs.length !== 1 ? "s" : ""}.`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border/40 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/pharmacy-os")}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2">
              <Barcode className="h-5 w-5 text-primary" />
              <div>
                <h1 className="font-semibold text-sm">Barcode Print Queue</h1>
                <p className="text-xs text-muted-foreground">Code 128 / ZPL label generation</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {jobs.length > 0 && (
              <Badge variant="outline" className="text-xs">
                {jobs.length} in queue
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={downloadAll} className="h-8 gap-1.5 text-xs">
              <Download className="h-3.5 w-3.5" />
              Download all
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: form */}
        <div className="space-y-4">
          {/* Tab selector */}
          <div className="flex gap-1 bg-card/60 rounded-lg p-1 border border-border/40">
            <button
              onClick={() => setActiveTab("batch")}
              className={`flex-1 py-2 px-3 rounded-md text-xs font-medium transition-colors ${activeTab === "batch" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Batch Label
            </button>
            <button
              onClick={() => setActiveTab("dispatch")}
              className={`flex-1 py-2 px-3 rounded-md text-xs font-medium transition-colors ${activeTab === "dispatch" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Dispatch Label
            </button>
          </div>

          {activeTab === "batch" ? (
            <Card className="bg-card/60 border-border/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary" />
                  Batch / Inventory Label
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Product name *</Label>
                  <Input
                    value={productName}
                    onChange={e => setProductName(e.target.value)}
                    placeholder="e.g. Paracetamol 500mg"
                    className="mt-1 h-9 text-sm bg-background/60"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Batch number *</Label>
                    <Input
                      value={batchNumber}
                      onChange={e => setBatchNumber(e.target.value)}
                      placeholder="e.g. BT240501"
                      className="mt-1 h-9 text-sm bg-background/60"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Expiry date *</Label>
                    <Input
                      value={expiryDate}
                      onChange={e => setExpiryDate(e.target.value)}
                      placeholder="e.g. 05/2027"
                      className="mt-1 h-9 text-sm bg-background/60"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">MRP (₹) *</Label>
                    <Input
                      value={mrp}
                      onChange={e => setMrp(e.target.value)}
                      placeholder="e.g. 45.50"
                      className="mt-1 h-9 text-sm bg-background/60"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Barcode (optional)</Label>
                    <Input
                      value={barcode}
                      onChange={e => setBarcode(e.target.value)}
                      placeholder="defaults to batch no."
                      className="mt-1 h-9 text-sm bg-background/60"
                    />
                  </div>
                </div>
                <Button onClick={addBatchLabel} className="w-full h-9 text-sm gap-2">
                  <Plus className="h-4 w-4" />
                  Add to print queue
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-card/60 border-border/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Printer className="h-4 w-4 text-primary" />
                  Dispatch / Shipping Label
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Order ID *</Label>
                    <Input
                      value={orderId}
                      onChange={e => setOrderId(e.target.value)}
                      placeholder="e.g. ORD-000123"
                      className="mt-1 h-9 text-sm bg-background/60"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Phone *</Label>
                    <Input
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="e.g. 9876543210"
                      className="mt-1 h-9 text-sm bg-background/60"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Customer name *</Label>
                  <Input
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    placeholder="e.g. Rahul Sharma"
                    className="mt-1 h-9 text-sm bg-background/60"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Delivery address *</Label>
                  <Input
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    placeholder="e.g. 12, Lake Road, Powai, Mumbai"
                    className="mt-1 h-9 text-sm bg-background/60"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Items summary</Label>
                  <Input
                    value={items}
                    onChange={e => setItems(e.target.value)}
                    placeholder="e.g. Paracetamol x2, Vitamin C x1"
                    className="mt-1 h-9 text-sm bg-background/60"
                  />
                </div>
                <Button onClick={addDispatchLabel} className="w-full h-9 text-sm gap-2">
                  <Plus className="h-4 w-4" />
                  Add to print queue
                </Button>
              </CardContent>
            </Card>
          )}

          {/* ZPL info */}
          <Card className="bg-card/60 border-border/40">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong className="text-foreground">ZPL output</strong> is compatible with all Zebra thermal label printers (ZT200, ZT400, ZD400 series). Download the <code className="text-primary">.zpl</code> file and send to your printer via USB, network, or Zebra Setup Utilities. Labels use <strong className="text-foreground">Code 128</strong> barcodes.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Right: print queue */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Print Queue</h2>
            {jobs.length > 0 && (
              <button
                onClick={() => setJobs([])}
                className="text-xs text-muted-foreground hover:text-destructive transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          {jobs.length === 0 ? (
            <Card className="bg-card/60 border-border/40">
              <CardContent className="p-8 flex flex-col items-center gap-3">
                <Barcode className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground text-center">
                  No labels in queue yet.<br />Add batch or dispatch labels using the form.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => (
                <Card key={job.id} className="bg-card/60 border-border/40">
                  <CardContent className="p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{job.productName}</p>
                      {job.expiryDate && (
                        <p className="text-xs text-muted-foreground">
                          Batch: {job.batchNumber} · Exp: {job.expiryDate} · MRP: ₹{job.mrp}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Barcode: <code className="text-primary">{job.barcode}</code>
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => {
                          if (job.zpl) downloadZpl(job.zpl, `${job.batchNumber}.zpl`);
                        }}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => removeJob(job.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
