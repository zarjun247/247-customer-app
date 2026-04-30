import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Upload, FileText, CheckCircle2, Clock, AlertTriangle, XCircle,
  RefreshCw, Eye, ChevronLeft, Cpu, Package, ShoppingCart,
  Loader2, Search, Check, X, Edit2, Zap
} from "lucide-react";

// ── helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  queued:       { label: "Queued",        color: "bg-slate-500/20 text-slate-300",   icon: Clock },
  processing:   { label: "Processing",    color: "bg-blue-500/20 text-blue-300",     icon: Loader2 },
  ocr_complete: { label: "OCR Done",      color: "bg-violet-500/20 text-violet-300", icon: Cpu },
  under_review: { label: "Under Review",  color: "bg-amber-500/20 text-amber-300",   icon: Eye },
  committed:    { label: "Committed",     color: "bg-emerald-500/20 text-emerald-300", icon: CheckCircle2 },
  failed:       { label: "Failed",        color: "bg-red-500/20 text-red-300",       icon: XCircle },
};

const MATCH_CONFIG: Record<string, { label: string; color: string }> = {
  auto_matched:    { label: "Auto-matched", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  review_required: { label: "Needs Review", color: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  unknown_sku:     { label: "Unknown SKU",  color: "bg-red-500/20 text-red-300 border-red-500/30" },
  rejected:        { label: "Rejected",     color: "bg-slate-500/20 text-slate-400 border-slate-500/30" },
};

function confidenceColor(conf: string | number | null | undefined) {
  const v = Number(conf ?? 0);
  if (v >= 95) return "text-emerald-400";
  if (v >= 70) return "text-amber-400";
  return "text-red-400";
}

// ── Upload Panel ─────────────────────────────────────────────────────────────

function UploadPanel({ onJobCreated }: { onJobCreated: (id: number) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [sourceType, setSourceType] = useState<"upload" | "csv_import">("upload");

  const uploadBill = trpc.ocr.uploadBill.useMutation();
  const processJob = trpc.ocr.processJob.useMutation();

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      // Upload to storage first
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      let fileUrl = `https://placeholder.storage/${Date.now()}/${file.name}`;
      let fileKey = `ocr/${Date.now()}/${file.name}`;
      if (uploadRes.ok) {
        const data = await uploadRes.json();
        fileUrl = data.url ?? fileUrl;
        fileKey = data.key ?? fileKey;
      }
      const { jobId } = await uploadBill.mutateAsync({
        storeId: 1, fileUrl, fileKey, filename: file.name,
        mimeType: file.type, fileSizeBytes: file.size, sourceType: "upload",
      });
      await processJob.mutateAsync({ jobId, useLlmOcr: file.type.startsWith("image/") });
      toast.success(`Bill processed: ${file.name}`);
      onJobCreated(jobId);
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleCsvImport = async () => {
    if (!csvText.trim()) { toast.error("Paste CSV content first"); return; }
    setUploading(true);
    try {
      const { jobId } = await uploadBill.mutateAsync({
        storeId: 1, fileUrl: "data:text/csv;base64,", fileKey: `csv/${Date.now()}.csv`,
        filename: `import-${Date.now()}.csv`, mimeType: "text/csv", sourceType: "csv_import",
      });
      await processJob.mutateAsync({ jobId, rawCsvText: csvText });
      toast.success("CSV imported and processed");
      onJobCreated(jobId);
      setCsvText("");
    } catch (e: any) {
      toast.error(e.message ?? "Import failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setSourceType("upload")}
          className={`p-4 rounded-xl border text-left transition-all ${sourceType === "upload" ? "border-violet-500/50 bg-violet-500/10" : "border-white/10 bg-white/5 hover:bg-white/8"}`}
        >
          <Upload className="w-5 h-5 mb-2 text-violet-400" />
          <p className="font-medium text-sm">Upload File</p>
          <p className="text-xs text-white/50 mt-0.5">Image, PDF, or scanned bill</p>
        </button>
        <button
          onClick={() => setSourceType("csv_import")}
          className={`p-4 rounded-xl border text-left transition-all ${sourceType === "csv_import" ? "border-violet-500/50 bg-violet-500/10" : "border-white/10 bg-white/5 hover:bg-white/8"}`}
        >
          <FileText className="w-5 h-5 mb-2 text-violet-400" />
          <p className="font-medium text-sm">CSV / Excel</p>
          <p className="text-xs text-white/50 mt-0.5">Paste or import structured data</p>
        </button>
      </div>

      {sourceType === "upload" ? (
        <div
          className="border-2 border-dashed border-white/20 rounded-xl p-10 text-center cursor-pointer hover:border-violet-500/50 hover:bg-violet-500/5 transition-all"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
              <p className="text-white/60">Processing bill with AI OCR...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Upload className="w-8 h-8 text-white/30" />
              <div>
                <p className="font-medium">Drop bill here or click to browse</p>
                <p className="text-sm text-white/50 mt-1">JPG, PNG, PDF up to 16MB</p>
              </div>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-white/70 text-xs">CSV Format: ItemName, Manufacturer, BatchNo, ExpiryDate, MRP, PurchaseRate, Qty, FreeQty, Discount%, GST%, HSN</Label>
            <Textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={"ItemName,Manufacturer,BatchNo,ExpiryDate,MRP,PurchaseRate,Qty,FreeQty,Discount,GST,HSN\nCalpol 500mg Tab,GSK,CP2401,12/2026,25.00,18.50,100,0,10,12,30049099"}
              className="bg-white/5 border-white/10 text-white font-mono text-xs h-40 resize-none"
            />
          </div>
          <Button onClick={handleCsvImport} disabled={uploading} className="w-full bg-violet-600 hover:bg-violet-700">
            {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing...</> : <><FileText className="w-4 h-4 mr-2" />Import CSV</>}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 opacity-50">
        {["Email Inbox", "WhatsApp", "Watched Folder", "Legacy Import"].map((src) => (
          <button key={src} className="p-3 rounded-lg border border-white/10 bg-white/3 text-xs text-white/40 text-left cursor-not-allowed" title="Coming soon">
            {src} <span className="ml-1 text-[10px] bg-white/10 px-1 rounded">Soon</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Job List ─────────────────────────────────────────────────────────────────

function JobList({ onSelect }: { onSelect: (id: number) => void }) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { data, refetch, isLoading } = trpc.ocr.listJobs.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter as any,
    limit: 50,
  });

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {["all", "ocr_complete", "under_review", "committed", "failed"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${statusFilter === s ? "bg-violet-600 text-white" : "bg-white/5 text-white/50 hover:bg-white/10"}`}
          >
            {s === "all" ? "All" : STATUS_CONFIG[s]?.label ?? s}
          </button>
        ))}
        <button onClick={() => refetch()} className="ml-auto p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
          <RefreshCw className="w-3.5 h-3.5 text-white/50" />
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-white/40" /></div>
      ) : (data?.rows?.length ?? 0) === 0 ? (
        <div className="text-center py-16 text-white/40">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No ingestion jobs yet</p>
        </div>
      ) : (
        data?.rows?.map((job) => {
          const cfg = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.queued;
          const Icon = cfg.icon;
          return (
            <Card key={job.id} className="bg-white/5 border-white/10 cursor-pointer hover:bg-white/8 transition-colors" onClick={() => onSelect(job.id)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-white/60" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{job.filename ?? "Bill"}</p>
                      <p className="text-xs text-white/50">{new Date(job.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {job.totalLines != null && (
                      <div className="text-right text-xs text-white/50">
                        <span className="text-emerald-400">{job.matchedLines ?? 0}</span>/<span>{job.totalLines}</span> matched
                      </div>
                    )}
                    <Badge className={`${cfg.color} border-0 gap-1 text-xs`}>
                      <Icon className="w-3 h-3" /> {cfg.label}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}

// ── Line Reviewer ─────────────────────────────────────────────────────────────

function LineReviewer({ jobId, onBack }: { jobId: number; onBack: () => void }) {
  const [filter, setFilter] = useState<"all" | "review_required" | "unknown_sku" | "auto_matched">("all");
  const [editLine, setEditLine] = useState<any>(null);
  const utils = trpc.useUtils();

  const { data: jobData } = trpc.ocr.getJob.useQuery({ jobId });
  const { data: linesData, refetch } = trpc.ocr.getLines.useQuery({
    jobId,
    matchStatus: filter === "all" ? undefined : filter as any,
  });

  const reviewLine = trpc.ocr.reviewLine.useMutation({
    onSuccess: () => { refetch(); utils.ocr.getJob.invalidate({ jobId }); },
    onError: (e) => toast.error(e.message),
  });

  const generateDraft = trpc.ocr.generateDraft.useMutation({
    onSuccess: (d) => toast.success(`Draft #${d.draftId} created with ${d.lineCount} lines`),
    onError: (e) => toast.error(e.message),
  });

  const header = jobData?.headers?.[0];
  const job = jobData?.job;
  const lines = linesData?.lines ?? [];
  const reviewCount = jobData?.tasks?.filter((t: any) => t.status === "pending").length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-white/60 hover:text-white">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{job?.filename ?? "Bill"}</p>
          {header && <p className="text-xs text-white/50">{header.supplierName} · INV: {header.invoiceNo} · {header.invoiceDate}</p>}
        </div>
        <Badge className={`${(STATUS_CONFIG[job?.status ?? "queued"] ?? STATUS_CONFIG.queued).color} border-0 text-xs`}>
          {STATUS_CONFIG[job?.status ?? "queued"]?.label ?? job?.status}
        </Badge>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Total", value: job?.totalLines ?? 0, color: "text-white" },
          { label: "Auto-matched", value: job?.matchedLines ?? 0, color: "text-emerald-400" },
          { label: "Review", value: job?.reviewLines ?? 0, color: "text-amber-400" },
          { label: "Unknown SKU", value: job?.unknownLines ?? 0, color: "text-red-400" },
        ].map((s) => (
          <div key={s.label} className="bg-white/5 rounded-lg p-3 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-white/50 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "review_required", "unknown_sku", "auto_matched"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${filter === f ? "bg-violet-600 text-white" : "bg-white/5 text-white/50 hover:bg-white/10"}`}
          >
            {f === "all" ? "All Lines" : MATCH_CONFIG[f]?.label ?? f}
          </button>
        ))}
      </div>

      {/* Lines */}
      <div className="space-y-2">
        {lines.length === 0 ? (
          <div className="text-center py-10 text-white/40">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p>No lines in this filter</p>
          </div>
        ) : lines.map((line: any) => {
          const mc = MATCH_CONFIG[line.matchStatus] ?? MATCH_CONFIG.review_required;
          return (
            <div key={line.id} className={`p-3 rounded-xl border ${mc.color} bg-white/3`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-sm truncate">{line.itemName}</p>
                    <Badge className={`${mc.color} border text-[10px] px-1.5 py-0 shrink-0`}>{mc.label}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-white/50">
                    {line.manufacturer && <span>{line.manufacturer}</span>}
                    {line.batchNo && <span>Batch: {line.batchNo}</span>}
                    {line.expiryDate && <span>Exp: {line.expiryDate}</span>}
                    {line.mrp && <span>MRP: ₹{line.mrp}</span>}
                    {line.purchaseRate && <span>Rate: ₹{line.purchaseRate}</span>}
                    {line.qty && <span>Qty: {line.qty}{line.freeQty ? `+${line.freeQty}F` : ""}</span>}
                    {line.gstRate && <span>GST: {line.gstRate}%</span>}
                    {line.hsnCode && <span>HSN: {line.hsnCode}</span>}
                  </div>
                  {line.candidates?.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {line.candidates.slice(0, 3).map((c: any) => (
                        <button
                          key={c.id}
                          onClick={() => reviewLine.mutate({ lineId: line.id, action: "reassign", selectedProductId: c.productId })}
                          className={`text-[10px] px-2 py-0.5 rounded border transition-all ${c.isSelected ? "border-violet-500/50 bg-violet-500/20 text-violet-300" : "border-white/10 bg-white/5 text-white/40 hover:border-white/20"}`}
                        >
                          {c.productName ?? `Product #${c.productId}`} ({Math.round(Number(c.matchScore))}%)
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-xs font-mono ${confidenceColor(line.matchConfidence ?? line.confidence)}`}>
                    {Math.round(Number(line.matchConfidence ?? line.confidence ?? 0))}%
                  </span>
                  {line.matchStatus !== "auto_matched" && line.matchStatus !== "rejected" && (
                    <Button size="sm" variant="outline" className="h-6 px-2 text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                      onClick={() => reviewLine.mutate({ lineId: line.id, action: "approve" })}>
                      <Check className="w-3 h-3" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-white/40 hover:bg-white/10"
                    onClick={() => setEditLine(line)}>
                    <Edit2 className="w-3 h-3" />
                  </Button>
                  {line.matchStatus !== "rejected" && (
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-red-400 hover:bg-red-500/10"
                      onClick={() => reviewLine.mutate({ lineId: line.id, action: "reject", rejectionReason: "Manual rejection" })}>
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Generate draft button */}
      {(job?.matchedLines ?? 0) > 0 && (
        <Button
          className="w-full bg-violet-600 hover:bg-violet-700"
          onClick={() => generateDraft.mutate({ jobId })}
          disabled={generateDraft.isPending}
        >
          {generateDraft.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating...</> : <><Zap className="w-4 h-4 mr-2" />Generate Purchase Draft ({job?.matchedLines} lines)</>}
        </Button>
      )}

      {/* Edit line dialog */}
      {editLine && (
        <EditLineDialog
          line={editLine}
          onSave={(data) => { reviewLine.mutate({ lineId: editLine.id, action: "approve", ...data }); setEditLine(null); }}
          onClose={() => setEditLine(null)}
        />
      )}
    </div>
  );
}

function EditLineDialog({ line, onSave, onClose }: { line: any; onSave: (data: any) => void; onClose: () => void }) {
  const [form, setForm] = useState({
    itemName: line.itemName ?? "",
    batchNo: line.batchNo ?? "",
    expiryDate: line.expiryDate ?? "",
    mrp: line.mrp ?? "",
    purchaseRate: line.purchaseRate ?? "",
    qty: line.qty ?? "",
    freeQty: line.freeQty ?? "",
    discount: line.discount ?? "",
    gstRate: line.gstRate ?? "",
    hsnCode: line.hsnCode ?? "",
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-[#1a1a2e] border-white/10 text-white max-w-lg">
        <DialogHeader><DialogTitle>Edit Extracted Line</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="col-span-2 space-y-1"><Label className="text-white/60 text-xs">Item Name</Label><Input value={form.itemName} onChange={(e) => setForm(f => ({ ...f, itemName: e.target.value }))} className="bg-white/5 border-white/10 text-white h-8" /></div>
          {[
            { key: "batchNo", label: "Batch No" }, { key: "expiryDate", label: "Expiry Date" },
            { key: "mrp", label: "MRP (₹)" }, { key: "purchaseRate", label: "Purchase Rate (₹)" },
            { key: "qty", label: "Qty" }, { key: "freeQty", label: "Free Qty" },
            { key: "discount", label: "Discount %" }, { key: "gstRate", label: "GST %" },
            { key: "hsnCode", label: "HSN Code" },
          ].map(({ key, label }) => (
            <div key={key} className="space-y-1">
              <Label className="text-white/60 text-xs">{label}</Label>
              <Input value={(form as any)[key]} onChange={(e) => setForm(f => ({ ...f, [key]: e.target.value }))} className="bg-white/5 border-white/10 text-white h-8" />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-white/60">Cancel</Button>
          <Button onClick={() => onSave({ ...form, mrp: Number(form.mrp) || undefined, purchaseRate: Number(form.purchaseRate) || undefined, qty: Number(form.qty) || undefined, freeQty: Number(form.freeQty) || undefined, discount: Number(form.discount) || undefined, gstRate: Number(form.gstRate) || undefined })} className="bg-violet-600 hover:bg-violet-700">Save & Approve</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── SKU Draft Queue ───────────────────────────────────────────────────────────

function SkuDraftQueue() {
  const { data, refetch } = trpc.ocr.listSkuDrafts.useQuery({ status: "pending_review" });
  const reviewSkuDraft = trpc.ocr.reviewSkuDraft.useMutation({
    onSuccess: () => { refetch(); toast.success("SKU draft updated"); },
    onError: (e) => toast.error(e.message),
  });

  const drafts = data?.rows ?? [];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-white/60">{drafts.length} pending SKU creation{drafts.length !== 1 ? "s" : ""}</p>
        <Button variant="ghost" size="sm" onClick={() => refetch()} className="text-white/40 hover:text-white">
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>
      {drafts.length === 0 ? (
        <div className="text-center py-16 text-white/40">
          <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No unknown SKUs pending review</p>
        </div>
      ) : drafts.map((d: any) => (
        <Card key={d.id} className="bg-white/5 border-white/10">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{d.draftName}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-white/50">
                  {d.brand && <span>Brand: {d.brand}</span>}
                  {d.manufacturer && <span>Mfr: {d.manufacturer}</span>}
                  {d.genericName && <span>Generic: {d.genericName}</span>}
                  {d.scheduleFlag && <span>Schedule: {d.scheduleFlag}</span>}
                  {d.hsnCode && <span>HSN: {d.hsnCode}</span>}
                  {d.gstRate && <span>GST: {d.gstRate}%</span>}
                  {d.packSize && <span>Pack: {d.packSize}</span>}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" className="h-7 bg-emerald-600 hover:bg-emerald-700 text-xs"
                  onClick={() => reviewSkuDraft.mutate({ draftId: d.id, action: "approve" })}>
                  <Check className="w-3 h-3 mr-1" /> Approve
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-red-400 hover:bg-red-500/10"
                  onClick={() => reviewSkuDraft.mutate({ draftId: d.id, action: "reject" })}>
                  <X className="w-3 h-3 mr-1" /> Reject
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Draft Approval ────────────────────────────────────────────────────────────

function DraftApproval() {
  const [selectedDraftId, setSelectedDraftId] = useState<number | null>(null);
  const { data: draftsData, refetch: refetchDrafts } = trpc.ocr.listDrafts.useQuery({ status: "draft" });
  const { data: draftDetail } = trpc.ocr.getDraft.useQuery({ draftId: selectedDraftId! }, { enabled: !!selectedDraftId });

  const approveDraft = trpc.ocr.approveDraft.useMutation({
    onSuccess: () => { refetchDrafts(); toast.success("Draft approved — ready to commit"); },
    onError: (e) => toast.error(e.message),
  });
  const rejectDraft = trpc.ocr.rejectDraft.useMutation({
    onSuccess: () => { refetchDrafts(); setSelectedDraftId(null); toast.success("Draft rejected"); },
    onError: (e) => toast.error(e.message),
  });
  const commitDraft = trpc.ocr.commitDraft.useMutation({
    onSuccess: (d) => { refetchDrafts(); toast.success(`Purchase invoice #${d.invoiceId} created`); setSelectedDraftId(null); },
    onError: (e) => toast.error(e.message),
  });

  const drafts = draftsData?.rows ?? [];

  if (selectedDraftId && draftDetail) {
    const { draft, lines } = draftDetail;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedDraftId(null)} className="text-white/60 hover:text-white">
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div className="flex-1">
            <p className="font-semibold">Draft #{draft.id}</p>
            <p className="text-xs text-white/50">INV: {draft.invoiceNo ?? "—"} · {draft.invoiceDate ?? "—"} · {lines.length} lines</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="text-xs text-red-400 hover:bg-red-500/10"
              onClick={() => rejectDraft.mutate({ draftId: draft.id, reason: "Manual rejection" })}>
              Reject
            </Button>
            {draft.status === "draft" && (
              <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-xs"
                onClick={() => approveDraft.mutate({ draftId: draft.id })}>
                Approve
              </Button>
            )}
            {draft.status === "approved" && (
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-xs"
                onClick={() => commitDraft.mutate({ draftId: draft.id })}
                disabled={commitDraft.isPending}>
                {commitDraft.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <><ShoppingCart className="w-3 h-3 mr-1" />Commit to Purchase</>}
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          {lines.map((line: any) => (
            <div key={line.id} className={`p-3 rounded-lg border ${line.status === "rejected" ? "border-red-500/20 bg-red-500/5 opacity-50" : "border-white/10 bg-white/5"}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{line.productName ?? `Product #${line.productId}`}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-white/50">
                    {line.batchNo && <span>Batch: {line.batchNo}</span>}
                    {line.expiryDate && <span>Exp: {line.expiryDate}</span>}
                    {line.mrp && <span>MRP: ₹{line.mrp}</span>}
                    {line.purchaseRate && <span>Rate: ₹{line.purchaseRate}</span>}
                    {line.qty && <span>Qty: {line.qty}{line.freeQty ? `+${line.freeQty}F` : ""}</span>}
                    {line.gstRate && <span>GST: {line.gstRate}%</span>}
                    {line.landingCost && <span className="text-violet-300">LC: ₹{line.landingCost}</span>}
                    {line.margin && <span className="text-emerald-300">Margin: {line.margin}%</span>}
                  </div>
                </div>
                <Badge className={line.status === "rejected" ? "bg-red-500/20 text-red-300 border-0" : "bg-emerald-500/20 text-emerald-300 border-0"}>
                  {line.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-white/60">{drafts.length} draft{drafts.length !== 1 ? "s" : ""} awaiting approval</p>
      {drafts.length === 0 ? (
        <div className="text-center py-16 text-white/40">
          <ShoppingCart className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No purchase drafts pending approval</p>
          <p className="text-xs mt-1">Process a bill and generate a draft first</p>
        </div>
      ) : drafts.map((d: any) => (
        <Card key={d.id} className="bg-white/5 border-white/10 cursor-pointer hover:bg-white/8 transition-colors" onClick={() => setSelectedDraftId(d.id)}>
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-sm">Draft #{d.id}</p>
              <p className="text-xs text-white/50">INV: {d.invoiceNo ?? "—"} · {d.invoiceDate ?? "—"}</p>
            </div>
            <Badge className={d.status === "approved" ? "bg-emerald-500/20 text-emerald-300 border-0" : "bg-amber-500/20 text-amber-300 border-0"}>
              {d.status}
            </Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminOcr() {
  const [activeTab, setActiveTab] = useState("upload");
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);

  const handleJobCreated = (jobId: number) => {
    setSelectedJobId(jobId);
    setActiveTab("jobs");
  };

  return (
    <AdminLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">OCR Bill Ingestion</h1>
          <p className="text-white/50 text-sm mt-1">Upload supplier bills · AI extracts lines · Human reviews · Creates purchase draft</p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); if (v !== "jobs") setSelectedJobId(null); }}>
          <TabsList className="bg-white/5 border border-white/10">
            <TabsTrigger value="upload" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white text-white/60">
              <Upload className="w-3.5 h-3.5 mr-1.5" /> Upload
            </TabsTrigger>
            <TabsTrigger value="jobs" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white text-white/60">
              <FileText className="w-3.5 h-3.5 mr-1.5" /> Jobs
            </TabsTrigger>
            <TabsTrigger value="sku-queue" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white text-white/60">
              <Package className="w-3.5 h-3.5 mr-1.5" /> SKU Queue
            </TabsTrigger>
            <TabsTrigger value="drafts" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white text-white/60">
              <ShoppingCart className="w-3.5 h-3.5 mr-1.5" /> Drafts
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="mt-4">
            <Card className="bg-white/5 border-white/10">
              <CardHeader><CardTitle className="text-white text-base">New Bill Ingestion</CardTitle></CardHeader>
              <CardContent><UploadPanel onJobCreated={handleJobCreated} /></CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="jobs" className="mt-4">
            {selectedJobId ? (
              <Card className="bg-white/5 border-white/10">
                <CardContent className="p-4">
                  <LineReviewer jobId={selectedJobId} onBack={() => setSelectedJobId(null)} />
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-white/5 border-white/10">
                <CardHeader><CardTitle className="text-white text-base">Ingestion Jobs</CardTitle></CardHeader>
                <CardContent><JobList onSelect={(id) => setSelectedJobId(id)} /></CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="sku-queue" className="mt-4">
            <Card className="bg-white/5 border-white/10">
              <CardHeader><CardTitle className="text-white text-base">Unknown SKU Queue</CardTitle></CardHeader>
              <CardContent><SkuDraftQueue /></CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="drafts" className="mt-4">
            <Card className="bg-white/5 border-white/10">
              <CardHeader><CardTitle className="text-white text-base">Purchase Draft Approval</CardTitle></CardHeader>
              <CardContent><DraftApproval /></CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
