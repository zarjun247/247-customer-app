/**
 * PharmacistWorkbench.tsx
 * Internal page — visible only to users with role: pharmacist | admin
 * Shows the Rx review queue with quick-verify, approve, reject, manual-review, and gate-clear actions.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  ClipboardList, CheckCircle2, XCircle, Eye, Zap, ShieldCheck, AlertTriangle, Clock, RefreshCw,
} from "lucide-react";

const LANE_COLORS: Record<string, string> = {
  digital: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  on_file: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  fallback: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  otc: "bg-slate-500/20 text-slate-300 border-slate-500/30",
};

const STATUS_COLORS: Record<string, string> = {
  pending_pharmacist: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  quick_verify: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  additional_verification: "bg-red-500/20 text-red-300 border-red-500/30",
};

type RxItem = {
  id: number;
  userId: number;
  status: string;
  lane: string;
  imageUrl?: string | null;
  doctorName?: string | null;
  doctorReg?: string | null;
  prescribedDate?: Date | null;
  patientNote?: string | null;
  ocrText?: string | null;
  createdAt: Date;
};

type ActionType = "quickVerify" | "approve" | "reject" | "manualReview" | "clearGate";

export default function PharmacistWorkbench() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [selectedRx, setSelectedRx] = useState<RxItem | null>(null);
  const [actionType, setActionType] = useState<ActionType | null>(null);
  const [note, setNote] = useState("");
  const [orderIdForGate, setOrderIdForGate] = useState("");

  const utils = trpc.useUtils();

  const { data: queue = [], isLoading, refetch } = trpc.pharmacist.queue.useQuery(undefined, {
    refetchInterval: 30000,
    enabled: !!user && (user.role === "pharmacist" || user.role === "admin"),
  });

  const quickVerify = trpc.pharmacist.quickVerify.useMutation({
    onSuccess: () => { toast.success("Prescription quick-verified"); closeDialog(); utils.pharmacist.queue.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const approve = trpc.pharmacist.approve.useMutation({
    onSuccess: () => { toast.success("Prescription approved"); closeDialog(); utils.pharmacist.queue.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const reject = trpc.pharmacist.reject.useMutation({
    onSuccess: () => { toast.success("Prescription rejected"); closeDialog(); utils.pharmacist.queue.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const manualReview = trpc.pharmacist.sendToManualReview.useMutation({
    onSuccess: () => { toast.success("Sent for manual review"); closeDialog(); utils.pharmacist.queue.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const clearGate = trpc.pharmacist.clearGate.useMutation({
    onSuccess: () => { toast.success("Rx gate cleared — order moved to picking"); closeDialog(); },
    onError: (e) => toast.error(e.message),
  });

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary" />
      </div>
    );
  }

  if (!user || (user.role !== "pharmacist" && user.role !== "admin")) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-4">
        <ShieldCheck className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Pharmacist access required.</p>
        <Button variant="outline" onClick={() => navigate("/")}>Go home</Button>
      </div>
    );
  }

  function openAction(rx: RxItem, type: ActionType) {
    setSelectedRx(rx);
    setActionType(type);
    setNote("");
  }

  function closeDialog() {
    setSelectedRx(null);
    setActionType(null);
    setNote("");
    setOrderIdForGate("");
  }

  function handleConfirm() {
    if (!selectedRx || !actionType) return;
    if (actionType === "quickVerify") quickVerify.mutate({ rxId: selectedRx.id, note });
    else if (actionType === "approve") approve.mutate({ rxId: selectedRx.id, note });
    else if (actionType === "reject") reject.mutate({ rxId: selectedRx.id, note });
    else if (actionType === "manualReview") manualReview.mutate({ rxId: selectedRx.id, note });
    else if (actionType === "clearGate") {
      const orderId = parseInt(orderIdForGate, 10);
      if (isNaN(orderId)) { toast.error("Enter a valid order ID"); return; }
      clearGate.mutate({ orderId });
    }
  }

  const isSubmitting = quickVerify.isPending || approve.isPending || reject.isPending || manualReview.isPending || clearGate.isPending;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border/40 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ClipboardList className="h-5 w-5 text-primary" />
            <div>
              <h1 className="font-semibold text-sm">Pharmacist Workbench</h1>
              <p className="text-xs text-muted-foreground">Rx Review Queue</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {queue.length} pending
            </Badge>
            <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-8 w-8 p-0">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary" />
          </div>
        ) : queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <CheckCircle2 className="h-12 w-12 text-emerald-500/50" />
            <p className="text-muted-foreground text-sm">Queue is clear — no prescriptions pending review.</p>
          </div>
        ) : (
          queue.map((rx) => (
            <Card key={rx.id} className="bg-card/60 border-border/40">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle className="text-sm font-medium">Rx #{rx.id}</CardTitle>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={`text-xs ${LANE_COLORS[rx.lane] ?? ""}`}>
                        {rx.lane.replace("_", " ")}
                      </Badge>
                      <Badge variant="outline" className={`text-xs ${STATUS_COLORS[rx.status] ?? ""}`}>
                        {rx.status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {new Date(rx.createdAt).toLocaleString()}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {rx.imageUrl && (
                  <a href={rx.imageUrl} target="_blank" rel="noopener noreferrer">
                    <img
                      src={rx.imageUrl}
                      alt="Prescription"
                      className="w-full max-h-48 object-contain rounded-md border border-border/40 bg-black/20"
                    />
                  </a>
                )}
                {rx.doctorName && (
                  <p className="text-xs text-muted-foreground">
                    Dr. {rx.doctorName}{rx.doctorReg ? ` (Reg: ${rx.doctorReg})` : ""}
                    {rx.prescribedDate ? ` — ${new Date(rx.prescribedDate).toLocaleDateString()}` : ""}
                  </p>
                )}
                {rx.patientNote && (
                  <p className="text-xs text-muted-foreground italic">"{rx.patientNote}"</p>
                )}
                {rx.ocrText && (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer hover:text-foreground">OCR text</summary>
                    <pre className="mt-2 p-2 bg-muted/30 rounded text-xs whitespace-pre-wrap">{rx.ocrText}</pre>
                  </details>
                )}
                <Separator className="opacity-30" />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="ghost" className="h-8 text-xs gap-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                    onClick={() => openAction(rx, "quickVerify")} title={`Quick Verify Rx #${rx.id}`} aria-label={`Quick Verify Rx ${rx.id}`}>
                    <Zap className="h-3.5 w-3.5" /> Quick Verify
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs gap-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                    onClick={() => openAction(rx, "approve")} title={`Approve Rx #${rx.id}`} aria-label={`Approve Rx ${rx.id}`}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs gap-1.5 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                    onClick={() => openAction(rx, "manualReview")} title={`Manual Review Rx #${rx.id}`} aria-label={`Manual Review Rx ${rx.id}`}>
                    <Eye className="h-3.5 w-3.5" /> Manual Review
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    onClick={() => openAction(rx, "reject")} title={`Reject Rx #${rx.id}`} aria-label={`Reject Rx ${rx.id}`}>
                    <XCircle className="h-3.5 w-3.5" /> Reject
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs gap-1.5 text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
                    onClick={() => openAction(rx, "clearGate")} title={`Clear Gate for Rx #${rx.id}`} aria-label={`Clear Gate ${rx.id}`}>
                    <AlertTriangle className="h-3.5 w-3.5" /> Clear Gate
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Action Dialog */}
      <Dialog open={!!selectedRx} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="bg-card border-border/40 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {actionType === "quickVerify" && "Quick Verify Rx #" + selectedRx?.id}
              {actionType === "approve" && "Approve Rx #" + selectedRx?.id}
              {actionType === "reject" && "Reject Rx #" + selectedRx?.id}
              {actionType === "manualReview" && "Send to Manual Review — Rx #" + selectedRx?.id}
              {actionType === "clearGate" && "Clear Rx Gate"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {actionType === "clearGate" ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Enter the Order ID to clear the Rx gate and move it to picking:</p>
                <input
                  type="number"
                  value={orderIdForGate}
                  onChange={(e) => setOrderIdForGate(e.target.value)}
                  placeholder="Order ID"
                  className="w-full px-3 py-2 text-sm bg-muted/30 border border-border/40 rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            ) : (
              <Textarea
                placeholder={actionType === "reject" ? "Rejection reason (required)" : "Note (optional)"}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="text-sm bg-muted/30 border-border/40 resize-none h-24"
              />
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={closeDialog} disabled={isSubmitting}>Cancel</Button>
            <Button
              size="sm"
              disabled={isSubmitting || (actionType === "reject" && note.trim().length < 5)}
              className={
                actionType === "reject" ? "bg-red-600 hover:bg-red-700 text-white" :
                actionType === "approve" || actionType === "quickVerify" ? "bg-emerald-600 hover:bg-emerald-700 text-white" :
                ""
              }
              onClick={handleConfirm}
            >
              {isSubmitting ? "Processing..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
