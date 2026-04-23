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
    dotColor: "oklch(0.545 0.195 255)",
    bgColor: "oklch(0.965 0.020 255)",
    textColor: "oklch(0.545 0.195 255)",
  },
  pending_pharmacist: {
    label: "Being reviewed",
    sub: "A licensed pharmacist is reviewing your prescription.",
    dotColor: "oklch(0.720 0.150 55)",
    bgColor: "oklch(0.97 0.040 55)",
    textColor: "oklch(0.620 0.150 55)",
  },
  approved: {
    label: "Approved",
    sub: "Your prescription has been verified. Medicines may be dispensed.",
    dotColor: "oklch(0.600 0.160 145)",
    bgColor: "oklch(0.970 0.025 145)",
    textColor: "oklch(0.500 0.150 145)",
  },
  rejected: {
    label: "Could not be verified",
    sub: "Your prescription could not be verified. Please contact your pharmacist.",
    dotColor: "oklch(0.620 0.210 25)",
    bgColor: "oklch(0.97 0.015 25)",
    textColor: "oklch(0.550 0.180 25)",
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
      <div className="px-5 pt-6 pb-10">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="mb-7">
          <h1 className="text-xl font-semibold mb-1" style={{ color: "oklch(0.175 0.012 255)" }}>
            Prescriptions
          </h1>
          <p className="text-sm" style={{ color: "oklch(0.520 0.018 255)" }}>
            Reviewed by a licensed pharmacist before dispensing
          </p>
        </div>

        {/* ── Upload area ─────────────────────────────────────────────── */}
        {submitted ? (
          /* ── Submitted confirmation ─────────────────────────────────── */
          <div className="rounded-2xl p-8 text-center mb-6 card-shadow"
            style={{ background: "white", border: "1px solid oklch(0.910 0.008 255)" }}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: "oklch(0.970 0.025 145)" }}>
              <CheckCircle2 size={28} strokeWidth={1.75} style={{ color: "oklch(0.500 0.150 145)" }} />
            </div>
            <h2 className="text-base font-semibold mb-2" style={{ color: "oklch(0.175 0.012 255)" }}>
              Prescription received
            </h2>
            <p className="text-sm leading-relaxed mb-5" style={{ color: "oklch(0.520 0.018 255)", maxWidth: "22rem", margin: "0 auto 1.25rem" }}>
              A licensed pharmacist will review your prescription. You will be notified once it is approved.
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium"
              style={{ background: "oklch(0.97 0.040 55)", color: "oklch(0.620 0.150 55)" }}>
              <Clock size={14} />
              Being reviewed by a pharmacist
            </div>
          </div>
        ) : preview ? (
          /* ── Preview + submit ───────────────────────────────────────── */
          <div className="mb-6">
            <div className="relative rounded-2xl overflow-hidden mb-3 card-shadow"
              style={{ border: "1px solid oklch(0.910 0.008 255)" }}>
              <img src={preview} alt="Prescription" className="w-full max-h-72 object-contain bg-white" />
              <button
                onClick={() => setPreview(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-opacity hover:opacity-70"
                style={{ background: "white", border: "1px solid oklch(0.910 0.008 255)", color: "oklch(0.520 0.018 255)" }}
              >
                <X size={14} />
              </button>
            </div>
            <button
              onClick={handleUpload}
              disabled={uploading || uploadRx.isPending}
              className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: "oklch(0.545 0.195 255)", color: "white" }}
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
              background: "white",
              border: "2px dashed oklch(0.880 0.008 255)",
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
              style={{ background: "oklch(0.965 0.020 255)" }}>
              <Camera size={26} strokeWidth={1.5} style={{ color: "oklch(0.545 0.195 255)" }} />
            </div>
            <h2 className="text-base font-semibold mb-2" style={{ color: "oklch(0.175 0.012 255)" }}>
              Let us take care of this
            </h2>
            <p className="text-sm leading-relaxed mb-1" style={{ color: "oklch(0.520 0.018 255)" }}>
              Upload or photograph your prescription
            </p>
            <p className="text-xs" style={{ color: "oklch(0.650 0.012 255)" }}>
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
                  <div key={rx.id} className="bg-white rounded-xl p-4 card-shadow"
                    style={{ border: "1px solid oklch(0.910 0.008 255)" }}>
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: "oklch(0.965 0.004 255)" }}>
                        <FileText size={15} strokeWidth={1.5} style={{ color: "oklch(0.520 0.018 255)" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="text-sm font-semibold" style={{ color: "oklch(0.175 0.012 255)" }}>
                            Prescription #{rx.id}
                          </p>
                          <StatusBadge status={rx.status} />
                        </div>
                        <p className="text-xs mb-1" style={{ color: "oklch(0.650 0.012 255)" }}>
                          {new Date(rx.createdAt).toLocaleDateString("en-IN", {
                            day: "numeric", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit"
                          })}
                        </p>
                        <p className="text-xs leading-relaxed" style={{ color: "oklch(0.520 0.018 255)" }}>
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
          style={{ background: "oklch(0.965 0.004 255)" }}>
          <Shield size={13} strokeWidth={1.75} className="flex-shrink-0 mt-0.5"
            style={{ color: "oklch(0.520 0.018 255)" }} />
          <p className="text-xs leading-relaxed" style={{ color: "oklch(0.520 0.018 255)" }}>
            No Schedule H medicine is dispensed without explicit pharmacist approval. Prescriptions are stored securely and retained for the legally required period under the Drugs and Cosmetics Act. AI is not used for prescription assessment.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
