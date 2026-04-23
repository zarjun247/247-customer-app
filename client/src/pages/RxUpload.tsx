import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Camera, FileText, CheckCircle2, Clock, XCircle, ArrowLeft, Shield, X } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const STATUS_CONFIG: Record<string, { label: string; sub: string; cls: string }> = {
  pending_ocr:        { label: "Processing",            sub: "Document is being processed.", cls: "bg-muted text-muted-foreground" },
  pending_pharmacist: { label: "Pharmacist Reviewing",  sub: "A licensed pharmacist is reviewing this prescription.", cls: "bg-amber-500/15 text-amber-400" },
  approved:           { label: "Approved",              sub: "Prescription verified. Medicines may be dispensed.", cls: "bg-emerald-500/15 text-emerald-400" },
  rejected:           { label: "Rejected",              sub: "Prescription could not be verified. Contact your pharmacist.", cls: "bg-destructive/15 text-destructive" },
};

export default function RxUpload() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: prescriptions, refetch } = trpc.prescriptions.list.useQuery(undefined, { enabled: isAuthenticated });

  const uploadRx = trpc.prescriptions.upload.useMutation({
    onSuccess: () => {
      setPreview(null);
      setUploading(false);
      refetch();
      toast.success("Prescription submitted for pharmacist review.");
    },
    onError: (e) => {
      setUploading(false);
      toast.error(e.message);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("File exceeds 5MB limit."); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleUpload = () => {
    if (!preview) return;
    setUploading(true);
    const base64 = preview.split(",")[1];
    const mimeType = preview.split(";")[0].split(":")[1];
    uploadRx.mutate({ imageBase64: base64, mimeType });
  };

  return (
    <AppLayout>
      <div className="px-5 pt-5">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate("/catalog")}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-base font-semibold text-foreground">Prescriptions</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Upload and track pharmacist review</p>
          </div>
        </div>

        {/* ── Upload area ─────────────────────────────────────────────── */}
        <div className="mb-6">
          {preview ? (
            <div className="space-y-3">
              <div className="relative rounded-lg overflow-hidden border border-border">
                <img
                  src={preview}
                  alt="Prescription preview"
                  className="w-full max-h-64 object-contain bg-card"
                />
                <button
                  onClick={() => setPreview(null)}
                  className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-background/90 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X size={13} />
                </button>
              </div>
              <button
                onClick={handleUpload}
                disabled={uploading || uploadRx.isPending}
                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3.5 rounded-lg font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Submitting…
                  </>
                ) : "Submit for pharmacist review"}
              </button>
            </div>
          ) : (
            <div
              className="border border-dashed border-border rounded-lg px-6 py-10 text-center cursor-pointer hover:border-primary/40 hover:bg-card/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center mx-auto mb-4">
                <Camera size={18} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">Upload prescription</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Photograph or scan of a valid prescription.<br />
                JPG or PNG, up to 5 MB.
              </p>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </div>

        {/* ── Prescription history ─────────────────────────────────────── */}
        {prescriptions && prescriptions.length > 0 && (
          <div className="mb-5">
            <p className="section-label mb-3">Submission History</p>
            <div className="space-y-2">
              {prescriptions.map((rx) => {
                const config = STATUS_CONFIG[rx.status] ?? STATUS_CONFIG.pending_ocr;
                return (
                  <div key={rx.id} className="flex items-start gap-3 px-4 py-3.5 rounded-lg bg-card border border-border">
                    <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                      <FileText size={14} className="text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">Prescription #{rx.id}</p>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${config.cls}`}>
                          {config.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(rx.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric", month: "short", year: "numeric",
                          hour: "2-digit", minute: "2-digit"
                        })}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                        {config.sub}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Compliance note ───────────────────────────────────────────── */}
        <div className="flex items-start gap-2.5 px-4 py-3.5 rounded-lg bg-card border border-border mb-6">
          <Shield size={13} className="text-muted-foreground flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            No Schedule H medicine will be dispensed without explicit pharmacist approval. Prescriptions are stored securely and retained for the legally required period under the Drugs and Cosmetics Act. AI is not used for prescription assessment.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
