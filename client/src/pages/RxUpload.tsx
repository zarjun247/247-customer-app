import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useOnboardingGuard } from "@/hooks/useOnboardingGuard";
import AppLayout from "@/components/AppLayout";
import {
  Camera, FileText, CheckCircle2, Clock, Shield, X, Upload,
  BookOpen, Phone, ChevronRight, Star, AlertCircle, Archive
} from "lucide-react";
import { toast } from "sonner";

// ─── Status config — human language only ─────────────────────────────────────
const STATUS_CONFIG: Record<string, {
  label: string; sub: string;
  dotColor: string; bgColor: string; textColor: string;
}> = {
  pending_ocr: {
    label: "Received",
    sub: "Your prescription has been received and is being prepared for review.",
    dotColor: "#2B7FFF", bgColor: "rgba(43,127,255,0.10)", textColor: "#2B7FFF",
  },
  pending_pharmacist: {
    label: "Under pharmacist review",
    sub: "A licensed pharmacist is reviewing your prescription.",
    dotColor: "#F59E0B", bgColor: "rgba(245,158,11,0.10)", textColor: "#F59E0B",
  },
  approved: {
    label: "Approved",
    sub: "Your prescription has been verified. Medicines may be dispensed.",
    dotColor: "#00C896", bgColor: "rgba(0,200,150,0.10)", textColor: "#00C896",
  },
  additional_verification: {
    label: "Additional verification needed",
    sub: "Your pharmacist needs a little more information. They will contact you shortly.",
    dotColor: "#F59E0B", bgColor: "rgba(245,158,11,0.10)", textColor: "#F59E0B",
  },
  rejected: {
    label: "Could not be verified",
    sub: "Your prescription could not be verified. Please contact your pharmacist or upload a clearer image.",
    dotColor: "#F43F5E", bgColor: "rgba(244,63,94,0.10)", textColor: "#F43F5E",
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

// ─── Lane selector ────────────────────────────────────────────────────────────
type Lane = "upload" | "vault" | "pharmacist";

const LANES: { key: Lane; icon: React.ElementType; label: string; sub: string }[] = [
  {
    key: "upload",
    icon: Camera,
    label: "Upload prescription",
    sub: "Photo or PDF of your current prescription",
  },
  {
    key: "vault",
    icon: Archive,
    label: "Use a saved prescription",
    sub: "Approved prescriptions stored on file",
  },
  {
    key: "pharmacist",
    icon: Phone,
    label: "Pharmacist-assisted",
    sub: "Our pharmacist will help you over the phone",
  },
];

export default function RxUpload() {
  const { isAuthenticated } = useAuth();
  const { isReady } = useOnboardingGuard();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [activeLane, setActiveLane] = useState<Lane | null>(null);

  const { data: prescriptions, refetch } = trpc.prescriptions.list.useQuery(undefined, { enabled: isAuthenticated });
  const { data: vault } = trpc.prescriptions.vault.useQuery(undefined, { enabled: isAuthenticated && activeLane === "vault" });
  const { data: priorApprovals } = trpc.prescriptions.priorApprovals.useQuery(undefined, { enabled: isAuthenticated });

  const markOnFile = trpc.prescriptions.markOnFile.useMutation({
    onSuccess: () => { toast.success("Prescription saved to vault"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const uploadRx = trpc.prescriptions.upload.useMutation({
    onSuccess: () => {
      setPreview(null);
      setUploading(false);
      setSubmitted(true);
      refetch();
    },
    onError: (e) => { setUploading(false); toast.error(e.message); },
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

  if (!isReady) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center" style={{ background: "#0A0A0B" }}>
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: "#2B7FFF", borderTopColor: "transparent" }} />
        </div>
      </AppLayout>
    );
  }

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

        {/* ── Prior approval banner ────────────────────────────────────── */}
        {priorApprovals && (priorApprovals as any[]).length > 0 && (
          <div className="flex items-start gap-3 p-4 rounded-xl mb-5"
            style={{ background: "rgba(0,200,150,0.08)", border: "1px solid rgba(0,200,150,0.20)" }}>
            <Star size={14} strokeWidth={1.75} className="flex-shrink-0 mt-0.5" style={{ color: "#00C896" }} />
            <div>
              <p className="text-sm font-semibold mb-0.5" style={{ color: "#00C896" }}>
                {(priorApprovals as any[]).length} active prior approval{(priorApprovals as any[]).length > 1 ? "s" : ""}
              </p>
              <p className="text-xs leading-relaxed" style={{ color: "#6B6B75" }}>
                Your pharmacist has pre-approved certain medications for you. These can be dispensed without a new prescription.
              </p>
            </div>
          </div>
        )}

        {/* ── Lane selector ────────────────────────────────────────────── */}
        {!activeLane && (
          <div className="space-y-2.5 mb-6">
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#4B4B55" }}>
              How would you like to proceed?
            </p>
            {LANES.map(lane => {
              const Icon = lane.icon;
              return (
                <button
                  key={lane.key}
                  onClick={() => {
                    if (lane.key === "pharmacist") {
                      toast.info("Our pharmacist will call you within 30 minutes during pharmacy hours.");
                      return;
                    }
                    setActiveLane(lane.key);
                  }}
                  className="w-full flex items-center gap-4 p-4 rounded-xl text-left transition-all hover:opacity-80"
                  style={{ background: "#141416", border: "1px solid #2A2A2E" }}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(43,127,255,0.10)" }}>
                    <Icon size={18} strokeWidth={1.5} style={{ color: "#2B7FFF" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "#F0F0F2" }}>{lane.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: "#6B6B75" }}>{lane.sub}</p>
                  </div>
                  <ChevronRight size={15} strokeWidth={1.75} style={{ color: "#4B4B55" }} />
                </button>
              );
            })}
          </div>
        )}

        {/* ── Upload lane ──────────────────────────────────────────────── */}
        {activeLane === "upload" && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold" style={{ color: "#F0F0F2" }}>Upload prescription</p>
              <button onClick={() => { setActiveLane(null); setPreview(null); setSubmitted(false); }}
                className="text-xs transition-opacity hover:opacity-70" style={{ color: "#6B6B75" }}>
                ← Back
              </button>
            </div>

            {submitted ? (
              <div className="rounded-2xl p-8 text-center mb-4 card-shadow"
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
                  Under pharmacist review
                </div>
              </div>
            ) : preview ? (
              <div className="mb-4">
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
                    <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Submitting…</>
                  ) : (
                    <><Upload size={15} />Submit for pharmacist review</>
                  )}
                </button>
              </div>
            ) : (
              <div
                className="rounded-2xl p-8 text-center mb-4 cursor-pointer transition-all hover:shadow-md"
                style={{ background: "#141416", border: "2px dashed rgba(43,127,255,0.30)" }}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
                  style={{ background: "rgba(43,127,255,0.10)" }}>
                  <Camera size={26} strokeWidth={1.5} style={{ color: "#2B7FFF" }} />
                </div>
                <h2 className="text-base font-semibold mb-2" style={{ color: "#F0F0F2" }}>
                  Upload or photograph your prescription
                </h2>
                <p className="text-xs" style={{ color: "#4B4B55" }}>JPG or PNG · up to 5 MB</p>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>
        )}

        {/* ── Vault lane ───────────────────────────────────────────────── */}
        {activeLane === "vault" && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold" style={{ color: "#F0F0F2" }}>Saved prescriptions</p>
              <button onClick={() => setActiveLane(null)}
                className="text-xs transition-opacity hover:opacity-70" style={{ color: "#6B6B75" }}>
                ← Back
              </button>
            </div>

            {!vault || (vault as any[]).length === 0 ? (
              <div className="flex flex-col items-center py-10 text-center gap-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ background: "#141416", border: "1px solid #2A2A2E" }}>
                  <Archive size={18} strokeWidth={1.5} style={{ color: "#4B4B55" }} />
                </div>
                <p className="text-sm font-semibold" style={{ color: "#F0F0F2" }}>No saved prescriptions</p>
                <p className="text-xs leading-relaxed" style={{ color: "#6B6B75", maxWidth: "18rem" }}>
                  Once a prescription is approved, you can save it to your vault for quick reuse.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {(vault as any[]).map((rx: any) => (
                  <div key={rx.id} className="bg-[#141416] rounded-xl p-4 card-shadow"
                    style={{ border: "1px solid #2A2A2E" }}>
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: "rgba(0,200,150,0.10)" }}>
                        <BookOpen size={14} strokeWidth={1.5} style={{ color: "#00C896" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="text-sm font-semibold" style={{ color: "#F0F0F2" }}>
                            Rx from {new Date(rx.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                          <span className="text-[10px] px-2 py-0.5 rounded-full"
                            style={{ background: "rgba(0,200,150,0.10)", color: "#00C896" }}>
                            {rx.isOnFile ? "On file" : "Approved"}
                          </span>
                        </div>
                        {!rx.isOnFile && (
                          <button
                            onClick={() => markOnFile.mutate({ id: rx.id })}
                            disabled={markOnFile.isPending}
                            className="text-xs font-medium transition-opacity hover:opacity-70 disabled:opacity-40"
                            style={{ color: "#2B7FFF" }}>
                            Save to vault for future use →
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Prescription history ─────────────────────────────────────── */}
        {prescriptions && prescriptions.length > 0 && (
          <div className="mb-6">
            <p className="section-label mb-3">Submission History</p>
            <div className="space-y-2">
              {(prescriptions as any[]).map((rx: any) => {
                const cfg = STATUS_CONFIG[rx.status] ?? STATUS_CONFIG.pending_ocr;
                const isAdditionalVerification = rx.status === "additional_verification";
                return (
                  <div key={rx.id} className="bg-[#141416] rounded-xl p-4 card-shadow"
                    style={{ border: isAdditionalVerification ? "1px solid rgba(245,158,11,0.30)" : "1px solid #2A2A2E" }}>
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: isAdditionalVerification ? "rgba(245,158,11,0.10)" : "#141416" }}>
                        {isAdditionalVerification
                          ? <AlertCircle size={15} strokeWidth={1.5} style={{ color: "#F59E0B" }} />
                          : <FileText size={15} strokeWidth={1.5} style={{ color: "#6B6B75" }} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="text-sm font-semibold" style={{ color: "#F0F0F2" }}>
                            {new Date(rx.createdAt).toLocaleDateString("en-IN", {
                              day: "numeric", month: "short", year: "numeric"
                            })}
                          </p>
                          <StatusBadge status={rx.status} />
                        </div>
                        <p className="text-xs leading-relaxed" style={{ color: "#6B6B75" }}>
                          {cfg.sub}
                        </p>
                        {rx.status === "approved" && !rx.isOnFile && (
                          <button
                            onClick={() => markOnFile.mutate({ id: rx.id })}
                            disabled={markOnFile.isPending}
                            className="mt-1.5 text-xs font-medium transition-opacity hover:opacity-70 disabled:opacity-40"
                            style={{ color: "#2B7FFF" }}>
                            Save to vault →
                          </button>
                        )}
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
