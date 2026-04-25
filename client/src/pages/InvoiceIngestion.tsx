import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import {
  Upload, FileText, CheckCircle, XCircle, AlertCircle,
  ChevronRight, RefreshCw, Eye, Check, X, GitMerge,
  Clock, Loader2, ArrowLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

// ─── Types ────────────────────────────────────────────────────────────────────

type IngestionStatus = "pending_ocr" | "ocr_complete" | "under_review" | "approved" | "rejected";
type ItemStatus = "pending" | "approved" | "rejected" | "merged";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: IngestionStatus) {
  const map: Record<IngestionStatus, { label: string; color: string }> = {
    pending_ocr: { label: "OCR Pending", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
    ocr_complete: { label: "OCR Done", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    under_review: { label: "Under Review", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
    approved: { label: "Approved", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
    rejected: { label: "Rejected", color: "bg-red-500/20 text-red-400 border-red-500/30" },
  };
  const { label, color } = map[status] ?? { label: status, color: "bg-zinc-500/20 text-zinc-400" };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${color}`}>
      {label}
    </span>
  );
}

function itemStatusIcon(status: ItemStatus) {
  if (status === "approved") return <CheckCircle className="w-4 h-4 text-emerald-400" />;
  if (status === "rejected") return <XCircle className="w-4 h-4 text-red-400" />;
  if (status === "merged") return <GitMerge className="w-4 h-4 text-blue-400" />;
  return <Clock className="w-4 h-4 text-amber-400" />;
}

function confidenceBar(confidence: string | null) {
  const pct = confidence ? Math.round(parseFloat(confidence)) : 0;
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-zinc-400 w-8 text-right">{pct}%</span>
    </div>
  );
}

// ─── Upload Panel ─────────────────────────────────────────────────────────────

function UploadPanel({ onUploaded }: { onUploaded: () => void }) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadMutation = trpc.ingestion.upload.useMutation({
    onSuccess: () => {
      setUploading(false);
      onUploaded();
    },
    onError: (err) => {
      setUploading(false);
      setError(err.message);
    },
  });

  async function handleFile(file: File) {
    if (!file) return;
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setError("Only PDF, JPEG, PNG, and WebP files are supported.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("File must be under 20 MB.");
      return;
    }

    setError(null);
    setUploading(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      uploadMutation.mutate({
        filename: file.name,
        mimeType: file.type as "application/pdf" | "image/jpeg" | "image/png" | "image/webp",
        base64Data: base64,
        storeId: (user as any)?.assignedStoreId ?? 1,
      });
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#0E0E10] p-6">
      <h2 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
        <Upload className="w-4 h-4 text-teal-400" />
        Upload Invoice
      </h2>

      <div
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          dragging ? "border-teal-400 bg-teal-400/5" : "border-white/15 hover:border-white/25"
        }`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
            <p className="text-sm text-zinc-400">Uploading and queuing OCR…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <FileText className="w-10 h-10 text-zinc-500" />
            <p className="text-sm text-zinc-300 font-medium">
              Drop invoice PDF or image here
            </p>
            <p className="text-xs text-zinc-500">PDF, JPEG, PNG, WebP · Max 20 MB</p>
            <Button variant="outline" size="sm" className="mt-2 border-white/20 text-zinc-300">
              Browse file
            </Button>
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />

      {error && (
        <p className="mt-3 text-xs text-red-400 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" /> {error}
        </p>
      )}
    </div>
  );
}

// ─── Review Items Panel ───────────────────────────────────────────────────────

function ReviewPanel({ ingestionId, onClose }: { ingestionId: number; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [noteDialog, setNoteDialog] = useState<{
    type: "approve" | "reject" | "merge";
    itemId: number;
  } | null>(null);
  const [note, setNote] = useState("");

  const { data: detail } = trpc.ingestion.get.useQuery({ ingestionId });
  const { data: items, refetch: refetchItems } = trpc.ingestion.getItems.useQuery({ ingestionId });

  const approveMutation = trpc.ingestion.approveItem.useMutation({
    onSuccess: () => { refetchItems(); setNoteDialog(null); setNote(""); },
  });
  const rejectMutation = trpc.ingestion.rejectItem.useMutation({
    onSuccess: () => { refetchItems(); setNoteDialog(null); setNote(""); },
  });
  const approveAllMutation = trpc.ingestion.approveAll.useMutation({
    onSuccess: () => { refetchItems(); utils.ingestion.list.invalidate(); },
  });
  const retryMutation = trpc.ingestion.retryOcr.useMutation({
    onSuccess: () => { utils.ingestion.get.invalidate({ ingestionId }); refetchItems(); },
  });

  if (!detail) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
      </div>
    );
  }

  const { ingestion, ocrJob } = detail;
  const pendingCount = items?.filter((i) => i.status === "pending").length ?? 0;
  const approvedCount = items?.filter((i) => i.status === "approved").length ?? 0;
  const rejectedCount = items?.filter((i) => i.status === "rejected").length ?? 0;

  function confirmAction() {
    if (!noteDialog) return;
    if (noteDialog.type === "approve") {
      approveMutation.mutate({ itemId: noteDialog.itemId, reviewNote: note || undefined });
    } else if (noteDialog.type === "reject") {
      rejectMutation.mutate({ itemId: noteDialog.itemId, reviewNote: note || undefined });
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          All ingestions
        </button>
        <div className="flex items-center gap-2">
          {ingestion.status === "pending_ocr" && (
            <Button
              variant="outline"
              size="sm"
              className="border-white/20 text-zinc-300 gap-1.5"
              onClick={() => retryMutation.mutate({ ingestionId })}
              disabled={retryMutation.isPending}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${retryMutation.isPending ? "animate-spin" : ""}`} />
              Retry OCR
            </Button>
          )}
          {pendingCount > 0 && (
            <Button
              size="sm"
              className="bg-teal-500 hover:bg-teal-400 text-black font-semibold gap-1.5"
              onClick={() => approveAllMutation.mutate({ ingestionId })}
              disabled={approveAllMutation.isPending}
            >
              <Check className="w-3.5 h-3.5" />
              Approve all ({pendingCount})
            </Button>
          )}
        </div>
      </div>

      {/* Ingestion summary */}
      <div className="rounded-xl border border-white/10 bg-[#0E0E10] p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-zinc-200">{ingestion.originalFilename}</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {new Date(ingestion.createdAt).toLocaleString("en-IN")}
            </p>
          </div>
          {statusBadge(ingestion.status as IngestionStatus)}
        </div>

        <div className="mt-3 flex gap-4 text-xs">
          <span className="text-zinc-400">
            Total: <span className="text-zinc-200 font-medium">{ingestion.itemCount}</span>
          </span>
          <span className="text-emerald-400">
            Approved: <span className="font-medium">{approvedCount}</span>
          </span>
          <span className="text-red-400">
            Rejected: <span className="font-medium">{rejectedCount}</span>
          </span>
          <span className="text-amber-400">
            Pending: <span className="font-medium">{pendingCount}</span>
          </span>
        </div>

        {ocrJob && ocrJob.status === "failed" && (
          <div className="mt-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-xs text-red-400">
              OCR failed: {ocrJob.errorMessage ?? "Unknown error"}
            </p>
          </div>
        )}
      </div>

      {/* Line items */}
      {!items || items.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-[#0E0E10] p-8 text-center">
          {ingestion.status === "pending_ocr" ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
              <p className="text-sm text-zinc-400">OCR in progress…</p>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No line items extracted yet.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className={`rounded-xl border bg-[#0E0E10] p-4 transition-colors ${
                item.status === "approved"
                  ? "border-emerald-500/20"
                  : item.status === "rejected"
                  ? "border-red-500/20"
                  : "border-white/10"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0">
                  {itemStatusIcon(item.status as ItemStatus)}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate">
                      {item.parsedName ?? "Unknown product"}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5 truncate">{item.rawLine}</p>
                  </div>
                </div>

                {item.status === "pending" && (
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => setNoteDialog({ type: "approve", itemId: item.id })}
                      className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors"
                      title="Approve"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setNoteDialog({ type: "reject", itemId: item.id })}
                      className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                      title="Reject"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Details grid */}
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs">
                {item.parsedBatch && (
                  <div>
                    <span className="text-zinc-500">Batch</span>
                    <p className="text-zinc-300 font-medium">{item.parsedBatch}</p>
                  </div>
                )}
                {item.parsedExpiry && (
                  <div>
                    <span className="text-zinc-500">Expiry</span>
                    <p className="text-zinc-300 font-medium">{item.parsedExpiry}</p>
                  </div>
                )}
                {item.parsedQty !== null && (
                  <div>
                    <span className="text-zinc-500">Qty</span>
                    <p className="text-zinc-300 font-medium">{item.parsedQty}</p>
                  </div>
                )}
                {item.parsedMrp && (
                  <div>
                    <span className="text-zinc-500">MRP</span>
                    <p className="text-zinc-300 font-medium">₹{item.parsedMrp}</p>
                  </div>
                )}
              </div>

              {/* Match confidence */}
              {item.matchedProductId && (
                <div className="mt-3">
                  <p className="text-xs text-zinc-500 mb-1">Product match confidence</p>
                  {confidenceBar(item.matchConfidence)}
                </div>
              )}

              {item.isDuplicate && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-400">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Possible duplicate of item #{item.duplicateOfId}
                </div>
              )}

              {item.reviewNote && (
                <p className="mt-2 text-xs text-zinc-500 italic">Note: {item.reviewNote}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Note dialog */}
      <Dialog open={!!noteDialog} onOpenChange={() => { setNoteDialog(null); setNote(""); }}>
        <DialogContent className="bg-[#0E0E10] border-white/10 text-zinc-100">
          <DialogHeader>
            <DialogTitle>
              {noteDialog?.type === "approve" ? "Approve item" : "Reject item"}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Optional review note…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="bg-[#141416] border-white/10 text-zinc-200 placeholder:text-zinc-600 resize-none"
            rows={3}
          />
          <DialogFooter>
            <Button
              variant="outline"
              className="border-white/20 text-zinc-300"
              onClick={() => { setNoteDialog(null); setNote(""); }}
            >
              Cancel
            </Button>
            <Button
              className={
                noteDialog?.type === "approve"
                  ? "bg-emerald-500 hover:bg-emerald-400 text-black font-semibold"
                  : "bg-red-500 hover:bg-red-400 text-white font-semibold"
              }
              onClick={confirmAction}
              disabled={approveMutation.isPending || rejectMutation.isPending}
            >
              {noteDialog?.type === "approve" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InvoiceIngestion() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: ingestions, refetch } = trpc.ingestion.list.useQuery({
    storeId: (user as any)?.assignedStoreId ?? undefined,
  });

  // Role guard
  const allowedRoles = ["admin", "store_manager", "inventory_operator"];
  if (user && !allowedRoles.includes(user.role)) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-zinc-300 font-medium">Access restricted</p>
          <p className="text-zinc-500 text-sm mt-1">
            Invoice ingestion is available to store managers and inventory operators only.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 border-white/20 text-zinc-300"
            onClick={() => navigate("/")}
          >
            Go home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-zinc-100">
      <div className="max-w-3xl mx-auto px-4 py-8 pb-24">
        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-zinc-100">Invoice Ingestion</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Upload supplier invoices for OCR extraction and human review.
          </p>
        </div>

        {selectedId ? (
          <ReviewPanel
            ingestionId={selectedId}
            onClose={() => { setSelectedId(null); refetch(); }}
          />
        ) : (
          <div className="space-y-6">
            <UploadPanel onUploaded={() => refetch()} />

            {/* Ingestion list */}
            <div>
              <h2 className="text-sm font-semibold text-zinc-400 mb-3">Recent Ingestions</h2>

              {!ingestions || ingestions.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-[#0E0E10] p-8 text-center">
                  <FileText className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                  <p className="text-sm text-zinc-500">No invoices uploaded yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {ingestions.map((ing) => (
                    <button
                      key={ing.id}
                      onClick={() => setSelectedId(ing.id)}
                      className="w-full text-left rounded-xl border border-white/10 bg-[#0E0E10] p-4 hover:border-white/20 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-200 truncate">
                            {ing.originalFilename}
                          </p>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            {new Date(ing.createdAt).toLocaleString("en-IN")} ·{" "}
                            {ing.itemCount} items
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {statusBadge(ing.status as IngestionStatus)}
                          <ChevronRight className="w-4 h-4 text-zinc-600" />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
