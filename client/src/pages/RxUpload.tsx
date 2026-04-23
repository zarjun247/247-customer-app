import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Camera, FileText, CheckCircle2, Clock, XCircle, Shield, X, Upload } from "lucide-react";
import { toast } from "sonner";

// ─── Status config — human language only ─────────────────────────────────────
const STATUS_CONFIG: Record<string, {
  label: string; sub: string;
  dotColor: string; bgColor: string; textColor: string;
}> = {
  pending_ocr: {
    label: "Received",
    sub: "Your prescription has been received and is being prepared for review.",
    dotColor: "#2B7FFF",
    bgColor: "rgba(43,127,255,0.10)",
    textColor: "#2B7FFF",
  },
  pending_pharmacist: {
    label: "Being reviewed",
    sub: "A licensed pharmacist is reviewing your prescription.",
    dotColor: "#F59E0B",
    bgColor: "rgba(245,158,11,0.10)",
    textColor: "#F59E0B",
  },
  approved: {
    label: "Approved",
    sub: "Your prescription has been verified. Medicines may be dispensed.",
    dotColor: "#00C896",
    bgColor: "rgba(0,200,150,0.10)",
    textColor: "#00C896",
  },
  rejected: {
    label: "Could not be verified",
    sub: "Your prescription could not be verified. Please contact your pharmacist.",
    dotColor: "#F43F5E",
    bgColor: "rgba(244,63,94,0.10)",
    textColor: "#F43F5E",
  },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending_ocr;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
      style={{ background: cfg.bgColor, color: cfg.textColor }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.dotColor }} />
      {cfg.label}
    </span>
  );
}

export default function RxUpload() {
  const { isAuthenticated } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const { data: prescriptions, refetch } = trpc.prescriptions.list.useQuery(undefined, { enabled: isAuthenticated });

  const uploadRx = trpc.prescriptions.upload.useMutation({
    onSuccess: () => {
      setPreview(null);
      setUploading(false);
      setSubmitted(true);
      refetch();
    },
    onError: (e) => {
      setUploading(false);
      toast.error(e.message);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("File exceeds 5 MB."); return; }
    const reader = new FileReader();
    reader.onload = (ev) => { setPreview(ev.target?.result as string); setSubmitted(false); };
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
      <div className="px-5 pt-6 pb-10" style={{ background: "#0A0A0B", minHeight: "100%" }}>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="mb-7">
          <h1 className="text-xl font-semibold mb-1" style={{ color: "#F0F0F2" }}>
            Prescriptions
          </h1>
          <p className="text-sm" style={{ color: "#6B6B75" }}>
            Reviewed by a licensed pharmacist before dispensing
          </p>
        </div>

        {/* ── Upload area ─────────────────────────────────────────────── */}
        {submitted ? (
          /* ── Submitted confirmation ─────────────────────────────────── */
          <div className="rounded-2xl p-8 text-center mb-6 card-shadow"
            style={{ background: "#141416", border: "1px solid #2A2A2E" }}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: "rgba(0,200,150,0.10)" }}>
              <CheckCircle2 size={28} strokeWidth={1.75} style={{ color: "#00C896" }} />
            </div>
            <h2 className="text-base font-semibold mb-2" style={{ color: "#F0F0F2" }}>
              Prescription received
            </h2>
            <p className="text-sm leading-relaxed mb-5" style={{ color: "#6B6B75", maxWidth: "22rem", margin: "0 auto 1.25rem" }}>
              A licensed pharmacist will review your prescription. You will be notified once it is approved.
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium"
              style={{ background: "rgba(245,158,11,0.10)", color: "#F59E0B" }}>
              <Clock size={14} />
              Being reviewed by a pharmacist
            </div>
          </div>
        ) : preview ? (
          /* ── Preview + submit ───────────────────────────────────────── */
          <div className="mb-6">
            <div className="relative rounded-2xl overflow-hidden mb-3 card-shadow"
              style={{ border: "1px solid #2A2A2E" }}>
              <img src={preview} alt="Prescription" className="w-full max-h-72 object-contain bg-[#141416]" />
              <button
                onClick={() => setPreview(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-opacity hover:opacity-70"
                style={{ background: "#141416", border: "1px solid #2A2A2E", color: "#6B6B75" }}
              >
                <X size={14} />
              </button>
            </div>
            <button
              onClick={handleUpload}
              disabled={uploading || uploadRx.isPending}
              className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: "#2B7FFF", color: "white" }}
            >
              {uploading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <Upload size={15} />
                  Submit for pharmacist review
                </>
              )}
            </button>
          </div>
        ) : (
          /* ── Upload prompt ──────────────────────────────────────────── */
          <div
            className="rounded-2xl p-8 text-center mb-6 cursor-pointer transition-all hover:shadow-md"
            style={{
              background: "#141416",
              border: "2px dashed rgba(43,127,255,0.30)",
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
              style={{ background: "rgba(43,127,255,0.10)" }}>
              <Camera size={26} strokeWidth={1.5} style={{ color: "#2B7FFF" }} />
            </div>
            <h2 className="text-base font-semibold mb-2" style={{ color: "#F0F0F2" }}>
              Let us take care of this
            </h2>
            <p className="text-sm leading-relaxed mb-1" style={{ color: "#6B6B75" }}>
              Upload or photograph your prescription
            </p>
            <p className="text-xs" style={{ color: "#4B4B55" }}>
              JPG or PNG · up to 5 MB
            </p>
          </div>
        )}

        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

        {/* ── Prescription history ─────────────────────────────────────── */}
        {prescriptions && prescriptions.length > 0 && (
          <div className="mb-6">
            <p className="section-label mb-3">Submission History</p>
            <div className="space-y-2">
              {prescriptions.map((rx) => {
                const cfg = STATUS_CONFIG[rx.status] ?? STATUS_CONFIG.pending_ocr;
                return (
                  <div key={rx.id} className="bg-[#141416] rounded-xl p-4 card-shadow"
                    style={{ border: "1px solid #2A2A2E" }}>
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: "#141416" }}>
                        <FileText size={15} strokeWidth={1.5} style={{ color: "#6B6B75" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="text-sm font-semibold" style={{ color: "#F0F0F2" }}>
                            Prescription #{rx.id}
                          </p>
                          <StatusBadge status={rx.status} />
                        </div>
                        <p className="text-xs mb-1" style={{ color: "#4B4B55" }}>
                          {new Date(rx.createdAt).toLocaleDateString("en-IN", {
                            day: "numeric", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit"
                          })}
                        </p>
                        <p className="text-xs leading-relaxed" style={{ color: "#6B6B75" }}>
                          {cfg.sub}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Compliance note ──────────────────────────────────────────── */}
        <div className="flex items-start gap-3 p-4 rounded-xl"
          style={{ background: "#141416" }}>
          <Shield size={13} strokeWidth={1.75} className="flex-shrink-0 mt-0.5"
            style={{ color: "#6B6B75" }} />
          <p className="text-xs leading-relaxed" style={{ color: "#6B6B75" }}>
            No Schedule H medicine is dispensed without explicit pharmacist approval. Prescriptions are stored securely and retained for the legally required period under the Drugs and Cosmetics Act. AI is not used for prescription assessment.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
