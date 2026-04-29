import { AdminLayout } from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useState } from "react";
import { ClipboardList, CheckCircle, XCircle, MessageSquare, Eye, Clock, Zap } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLOR: Record<string, string> = {
  pending_review: "bg-yellow-500/20 text-yellow-400",
  approved: "bg-green-500/20 text-green-400",
  rejected: "bg-red-500/20 text-red-400",
  additional_verification: "bg-amber-500/20 text-amber-400",
  expired: "bg-zinc-700/50 text-zinc-500",
};

export default function AdminPrescriptions() {
  const [selectedRx, setSelectedRx] = useState<any>(null);
  const [dialogMode, setDialogMode] = useState<"approve" | "reject" | "clarify" | null>(null);
  const [note, setNote] = useState("");
  const [imageOpen, setImageOpen] = useState(false);

  const { data: queue, refetch } = trpc.pharmacist.queue.useQuery(undefined, {
    refetchInterval: 15_000,
  });

  const approve = trpc.pharmacist.approve.useMutation({
    onSuccess: () => {
      toast.success(`Rx #${selectedRx?.id} approved`);
      setDialogMode(null);
      setSelectedRx(null);
      setNote("");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const reject = trpc.pharmacist.reject.useMutation({
    onSuccess: () => {
      toast.success(`Rx #${selectedRx?.id} rejected`);
      setDialogMode(null);
      setSelectedRx(null);
      setNote("");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const quickVerify = trpc.pharmacist.quickVerify.useMutation({
    onSuccess: () => {
      toast.success(`Rx #${selectedRx?.id} quick-verified`);
      setSelectedRx(null);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const sendToManual = trpc.pharmacist.sendToManualReview.useMutation({
    onSuccess: () => {
      toast.success(`Rx #${selectedRx?.id} sent for additional verification`);
      setDialogMode(null);
      setSelectedRx(null);
      setNote("");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  function handleAction() {
    if (!selectedRx) return;
    if (dialogMode === "approve") approve.mutate({ rxId: selectedRx.id, note });
    if (dialogMode === "reject") reject.mutate({ rxId: selectedRx.id, note: note || "Rejected by pharmacist" });
    if (dialogMode === "clarify") sendToManual.mutate({ rxId: selectedRx.id, note });
  }

  const isPending = approve.isPending || reject.isPending || sendToManual.isPending;

  return (
    <AdminLayout>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-zinc-100">Prescription Review Queue</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {queue?.length ?? 0} pending · refreshes every 15s
            </p>
          </div>
        </div>

        {/* Queue */}
        {!queue || queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <CheckCircle className="w-10 h-10 text-green-500/50" />
            <p className="text-zinc-500">All prescriptions reviewed</p>
          </div>
        ) : (
          <div className="space-y-3">
            {queue.map((rx: any) => {
              const age = Math.round((Date.now() - new Date(rx.createdAt).getTime()) / 60000);
              return (
                <div
                  key={rx.id}
                  className="bg-zinc-900 border border-white/5 rounded-xl p-4 flex items-start gap-4"
                >
                  {/* Rx image thumbnail */}
                  {rx.imageUrl ? (
                    <button
                      onClick={() => { setSelectedRx(rx); setImageOpen(true); }}
                      className="w-16 h-20 rounded-lg overflow-hidden border border-white/10 flex-shrink-0 bg-zinc-800 hover:border-white/30 transition-colors"
                    >
                      <img src={rx.imageUrl} alt="Rx" className="w-full h-full object-cover" />
                    </button>
                  ) : (
                    <div className="w-16 h-20 rounded-lg border border-white/10 flex-shrink-0 bg-zinc-800 flex items-center justify-center">
                      <ClipboardList className="w-5 h-5 text-zinc-600" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-zinc-200">Rx #{rx.id}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_COLOR[rx.status] ?? "bg-zinc-700 text-zinc-400"}`}>
                        {rx.status?.replace(/_/g, " ")}
                      </span>
                      {rx.source === "whatsapp" && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-500/20 text-green-400">
                          WhatsApp
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mb-2">
                      <Clock className="w-3 h-3 inline mr-1" />
                      {age < 60 ? `${age}m ago` : `${Math.round(age / 60)}h ago`} · User #{rx.userId}
                    </p>
                    {rx.notes && (
                      <p className="text-xs text-zinc-400 bg-zinc-800 rounded px-2 py-1 mb-2 line-clamp-2">
                        {rx.notes}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    {rx.imageUrl && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-white/10 text-zinc-400 hover:text-zinc-100 gap-1"
                        onClick={() => { setSelectedRx(rx); setImageOpen(true); }}
                      >
                        <Eye className="w-3 h-3" /> View
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="h-7 text-xs bg-green-600/20 text-green-400 hover:bg-green-600/30 border-0 gap-1"
                      onClick={() => { setSelectedRx(rx); setDialogMode("approve"); }}
                    >
                      <CheckCircle className="w-3 h-3" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-xs bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border-0 gap-1"
                      onClick={() => quickVerify.mutate({ rxId: rx.id })}
                      disabled={quickVerify.isPending}
                    >
                      <Zap className="w-3 h-3" /> Quick
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-xs bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 border-0 gap-1"
                      onClick={() => { setSelectedRx(rx); setDialogMode("clarify"); }}
                    >
                      <MessageSquare className="w-3 h-3" /> Clarify
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-xs bg-red-600/20 text-red-400 hover:bg-red-600/30 border-0 gap-1"
                      onClick={() => { setSelectedRx(rx); setDialogMode("reject"); }}
                    >
                      <XCircle className="w-3 h-3" /> Reject
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Action dialog */}
      <Dialog open={!!dialogMode} onOpenChange={() => { setDialogMode(null); setNote(""); }}>
        <DialogContent className="bg-zinc-900 border-white/10 text-zinc-100">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "approve" && "Approve Prescription"}
              {dialogMode === "reject" && "Reject Prescription"}
              {dialogMode === "clarify" && "Request Clarification"}
              {" — "}Rx #{selectedRx?.id}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-xs text-zinc-500 mb-1.5">
              {dialogMode === "reject" ? "Rejection reason (required)" : "Note (optional)"}
            </p>
            <Textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={
                dialogMode === "approve" ? "Approval note..." :
                dialogMode === "reject" ? "Reason for rejection..." :
                "Clarification required..."
              }
              className="bg-zinc-800 border-white/10 text-sm resize-none"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode(null)} className="border-white/10">
              Cancel
            </Button>
            <Button
              onClick={handleAction}
              disabled={isPending || (dialogMode === "reject" && !note.trim())}
              className={
                dialogMode === "approve" ? "bg-green-600 hover:bg-green-700" :
                dialogMode === "reject" ? "bg-red-600 hover:bg-red-700" :
                "bg-amber-600 hover:bg-amber-700"
              }
            >
              {isPending ? "Processing..." :
                dialogMode === "approve" ? "Approve" :
                dialogMode === "reject" ? "Reject" : "Send for Clarification"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image lightbox */}
      <Dialog open={imageOpen} onOpenChange={setImageOpen}>
        <DialogContent className="bg-zinc-950 border-white/10 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-zinc-300">Prescription Image — Rx #{selectedRx?.id}</DialogTitle>
          </DialogHeader>
          {selectedRx?.imageUrl && (
            <img
              src={selectedRx.imageUrl}
              alt="Prescription"
              className="w-full rounded-lg border border-white/10 max-h-[70vh] object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
