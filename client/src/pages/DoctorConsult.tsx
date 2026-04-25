import { useState } from "react";
import { useLocation } from "wouter";
import {
  Stethoscope, Clock, CheckCircle2, XCircle, AlertCircle,
  ChevronLeft, Loader2, MessageSquare, Calendar, Zap, ShieldAlert,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    requested:   { label: "Requested",   color: "#F59E0B", icon: Clock },
    assigned:    { label: "Assigned",    color: "#2B7FFF", icon: Stethoscope },
    in_progress: { label: "In progress", color: "#2B7FFF", icon: Loader2 },
    completed:   { label: "Completed",   color: "#00C896", icon: CheckCircle2 },
    cancelled:   { label: "Cancelled",   color: "#6B6B75", icon: XCircle },
    no_show:     { label: "No-show",     color: "#EF4444", icon: AlertCircle },
  };
  const cfg = map[status] ?? map["requested"];
  const Icon = cfg.icon;
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: `${cfg.color}22`, color: cfg.color }}
    >
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

// ─── Consult type card ────────────────────────────────────────────────────────
function ConsultTypeCard({
  type, selected, onSelect,
}: { type: "instant" | "scheduled"; selected: boolean; onSelect: () => void }) {
  const cfg = {
    instant:   { icon: Zap,      label: "Instant consult",   sub: "Connect with a doctor now (avg. 5 min wait)" },
    scheduled: { icon: Calendar, label: "Schedule for later", sub: "Book a slot at your convenience" },
  }[type];
  const Icon = cfg.icon;
  return (
    <button
      onClick={onSelect}
      className="w-full text-left rounded-xl p-4 transition-all"
      style={{
        background: selected ? "rgba(43,127,255,0.12)" : "#141416",
        border: `1.5px solid ${selected ? "#2B7FFF" : "rgba(255,255,255,0.08)"}`,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: selected ? "rgba(43,127,255,0.18)" : "rgba(255,255,255,0.06)" }}
        >
          <Icon className="w-4.5 h-4.5" style={{ color: selected ? "#2B7FFF" : "#9CA3AF" }} />
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: "#F0F0F2" }}>{cfg.label}</p>
          <p className="text-xs mt-0.5" style={{ color: "#6B6B75" }}>{cfg.sub}</p>
        </div>
      </div>
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function DoctorConsult() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();

  const [step, setStep] = useState<"type" | "complaint" | "review" | "done">("type");
  const [consultType, setConsultType] = useState<"instant" | "scheduled">("instant");
  const [complaint, setComplaint] = useState("");
  const [consentChecked, setConsentChecked] = useState(false);

  const utils = trpc.useUtils();
  const { data: consultHistory } = trpc.consult.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const requestConsult = trpc.consult.request.useMutation({
    onSuccess: () => {
      utils.consult.list.invalidate();
      setStep("done");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = () => {
    if (!consentChecked) {
      toast.error("Please confirm your consent before proceeding.");
      return;
    }
    requestConsult.mutate({ chiefComplaint: complaint, consultType });
  };

  const activeConsults = (consultHistory ?? []).filter(
    c => !["completed", "cancelled", "no_show"].includes(c.status)
  );
  const pastConsults = (consultHistory ?? []).filter(
    c => ["completed", "cancelled", "no_show"].includes(c.status)
  );

  return (
    <div className="min-h-screen" style={{ background: "#0A0A0C" }}>
      {/* Header */}
      <div
        className="sticky top-0 z-10 flex items-center gap-3 px-4 pt-safe"
        style={{ background: "rgba(10,10,12,0.95)", backdropFilter: "blur(12px)", paddingBottom: "12px", paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <button
          onClick={() => navigate("/rx")}
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          <ChevronLeft className="w-4 h-4" style={{ color: "#9CA3AF" }} />
        </button>
        <div>
          <p className="text-sm font-semibold" style={{ color: "#F0F0F2" }}>Talk to a doctor</p>
          <p className="text-[11px]" style={{ color: "#6B6B75" }}>Licensed MBBS / MD physicians</p>
        </div>
      </div>

      <div className="px-4 py-5 space-y-6 pb-safe" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}>

        {/* Active consults banner */}
        {activeConsults.length > 0 && (
          <div className="rounded-xl p-4 space-y-3" style={{ background: "rgba(43,127,255,0.08)", border: "1px solid rgba(43,127,255,0.2)" }}>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#2B7FFF" }}>Active consults</p>
            {activeConsults.map(c => (
              <div key={c.id} className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "#F0F0F2" }}>
                    {c.consultType === "instant" ? "Instant consult" : "Scheduled consult"}
                  </p>
                  <p className="text-xs mt-0.5 line-clamp-1" style={{ color: "#6B6B75" }}>
                    {c.chiefComplaint ?? "No complaint recorded"}
                  </p>
                  {c.assignedDoctorName && (
                    <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>
                      Dr. {c.assignedDoctorName}
                      {c.assignedDoctorReg ? ` · Reg: ${c.assignedDoctorReg}` : ""}
                    </p>
                  )}
                </div>
                <StatusBadge status={c.status} />
              </div>
            ))}
          </div>
        )}

        {/* New consult flow */}
        {step === "type" && (
          <div className="space-y-4">
            <div>
              <p className="text-base font-semibold" style={{ color: "#F0F0F2" }}>Request a consultation</p>
              <p className="text-xs mt-1" style={{ color: "#6B6B75" }}>
                Our network of licensed physicians can review your symptoms and issue a valid prescription if clinically appropriate.
              </p>
            </div>
            <div className="space-y-2">
              {(["instant", "scheduled"] as const).map(t => (
                <ConsultTypeCard key={t} type={t} selected={consultType === t} onSelect={() => setConsultType(t)} />
              ))}
            </div>
            <button
              onClick={() => setStep("complaint")}
              className="w-full py-3 rounded-xl text-sm font-semibold"
              style={{ background: "#2B7FFF", color: "#fff" }}
            >
              Continue
            </button>
          </div>
        )}

        {step === "complaint" && (
          <div className="space-y-4">
            <div>
              <button onClick={() => setStep("type")} className="flex items-center gap-1 text-xs mb-3" style={{ color: "#6B6B75" }}>
                <ChevronLeft className="w-3 h-3" /> Back
              </button>
              <p className="text-base font-semibold" style={{ color: "#F0F0F2" }}>Describe your concern</p>
              <p className="text-xs mt-1" style={{ color: "#6B6B75" }}>
                Be specific — include symptoms, duration, and any medications you are currently taking.
              </p>
            </div>
            <textarea
              value={complaint}
              onChange={e => setComplaint(e.target.value)}
              placeholder="e.g. Persistent dry cough for 5 days, mild fever, no known allergies…"
              rows={6}
              className="w-full rounded-xl px-4 py-3 text-sm resize-none"
              style={{
                background: "#141416",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#F0F0F2",
                outline: "none",
              }}
            />
            <button
              onClick={() => { if (complaint.trim().length >= 5) setStep("review"); else toast.error("Please describe your concern in at least 5 characters."); }}
              className="w-full py-3 rounded-xl text-sm font-semibold"
              style={{ background: "#2B7FFF", color: "#fff" }}
            >
              Review & confirm
            </button>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4">
            <div>
              <button onClick={() => setStep("complaint")} className="flex items-center gap-1 text-xs mb-3" style={{ color: "#6B6B75" }}>
                <ChevronLeft className="w-3 h-3" /> Back
              </button>
              <p className="text-base font-semibold" style={{ color: "#F0F0F2" }}>Review your request</p>
            </div>

            {/* Summary card */}
            <div className="rounded-xl p-4 space-y-3" style={{ background: "#141416", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex justify-between items-center">
                <span className="text-xs" style={{ color: "#6B6B75" }}>Consult type</span>
                <span className="text-xs font-medium" style={{ color: "#F0F0F2" }}>
                  {consultType === "instant" ? "Instant" : "Scheduled"}
                </span>
              </div>
              <div className="border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }} />
              <div>
                <span className="text-xs" style={{ color: "#6B6B75" }}>Chief complaint</span>
                <p className="text-sm mt-1" style={{ color: "#F0F0F2" }}>{complaint}</p>
              </div>
            </div>

            {/* Medical disclaimer */}
            <div className="rounded-xl p-4 space-y-3" style={{ background: "rgba(245,158,11,0.08)", border: "1.5px solid rgba(245,158,11,0.30)" }}>
              <div className="flex items-center gap-2">
                <ShieldAlert size={15} strokeWidth={1.75} style={{ color: "#F59E0B" }} />
                <p className="text-xs font-semibold" style={{ color: "#F59E0B" }}>Medical disclaimer</p>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: "#C4A35A" }}>
                This service connects you with licensed physicians for teleconsultation only. It is not a substitute for emergency care. If you are experiencing a medical emergency, call 112 immediately. Prescriptions are issued solely at the physician's clinical discretion and in accordance with applicable regulations.
              </p>
            </div>

            {/* Consent checkbox */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={e => setConsentChecked(e.target.checked)}
                className="mt-0.5 accent-blue-500"
              />
              <span className="text-xs leading-relaxed" style={{ color: "#9CA3AF" }}>
                I confirm that I have read and understood the medical disclaimer above, and I consent to a teleconsultation with a licensed physician on this platform.
              </span>
            </label>

            <button
              onClick={handleSubmit}
              disabled={requestConsult.isPending || !consentChecked}
              className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: "#2B7FFF", color: "#fff" }}
            >
              {requestConsult.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirm request
            </button>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center text-center py-8 space-y-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "rgba(0,200,150,0.12)" }}>
              <CheckCircle2 className="w-8 h-8" style={{ color: "#00C896" }} />
            </div>
            <div>
              <p className="text-base font-semibold" style={{ color: "#F0F0F2" }}>Request submitted</p>
              <p className="text-xs mt-1 max-w-xs" style={{ color: "#6B6B75" }}>
                {consultType === "instant"
                  ? "A doctor will be assigned to your consult shortly. You will be notified when they are ready."
                  : "Your scheduled consult request has been received. We will confirm your slot shortly."}
              </p>
            </div>
            <button
              onClick={() => { setStep("type"); setComplaint(""); setConsentChecked(false); }}
              className="text-xs underline"
              style={{ color: "#6B6B75" }}
            >
              Request another consult
            </button>
          </div>
        )}

        {/* Past consults */}
        {pastConsults.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#6B6B75" }}>Past consults</p>
            {pastConsults.map(c => (
              <div
                key={c.id}
                className="rounded-xl p-4 space-y-2"
                style={{ background: "#141416", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ color: "#F0F0F2" }}>
                      {c.consultType === "instant" ? "Instant consult" : "Scheduled consult"}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "#6B6B75" }}>
                      {new Date(c.requestedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
                {c.chiefComplaint && (
                  <p className="text-xs line-clamp-2" style={{ color: "#9CA3AF" }}>{c.chiefComplaint}</p>
                )}
                {c.consultNote && (
                  <div className="rounded-lg p-3 mt-1" style={{ background: "rgba(43,127,255,0.06)", border: "1px solid rgba(43,127,255,0.12)" }}>
                    <p className="text-[11px] font-semibold mb-1" style={{ color: "#2B7FFF" }}>
                      <MessageSquare className="w-3 h-3 inline mr-1" />Doctor's note
                    </p>
                    <p className="text-xs" style={{ color: "#9CA3AF" }}>{c.consultNote}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
