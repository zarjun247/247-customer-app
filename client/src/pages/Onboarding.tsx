import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Building2, Home, MapPin, ChevronRight, CheckCircle2, User } from "lucide-react";

const LOGO_URL = "/manus-storage/247-logo-transparent_ef3d59e3.png";

type Step = "name" | "building" | "flat" | "confirm";

export default function Onboarding() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [selectedBuilding, setSelectedBuilding] = useState<number | null>(null);
  const [flatNumber, setFlatNumber] = useState("");

  const { data: buildings, isLoading: buildingsLoading } = trpc.user.buildings.useQuery();

  const utils = trpc.useUtils();
  const completeOnboarding = trpc.user.completeOnboarding.useMutation({
    onSuccess: async () => {
      // Invalidate user profile so useOnboardingGuard sees the updated onboardingComplete flag
      await utils.user.profile.invalidate();
      navigate("/catalog");
    },
    onError: (e) => toast.error(e.message),
  });

  const selectedBuildingData = buildings?.find(b => b.id === selectedBuilding);

  const steps: Step[] = ["name", "building", "flat", "confirm"];
  const stepIndex = steps.indexOf(step);

  const goNext = () => {
    if (step === "name") {
      if (!name.trim()) { toast.error("Please enter your name"); return; }
      setStep("building");
    } else if (step === "building") {
      if (!selectedBuilding) { toast.error("Please select your building"); return; }
      setStep("flat");
    } else if (step === "flat") {
      if (!flatNumber.trim()) { toast.error("Please enter your flat number"); return; }
      setStep("confirm");
    } else if (step === "confirm") {
      completeOnboarding.mutate({
        name: name.trim(),
        buildingId: selectedBuilding!,
        flatNumber: flatNumber.trim(),
      });
    }
  };

  const goBack = () => {
    if (step === "building") setStep("name");
    else if (step === "flat") setStep("building");
    else if (step === "confirm") setStep("flat");
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: "#0A0A0B",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="flex-1 flex flex-col px-6 py-8 max-w-sm mx-auto w-full">

        {/* ── Logo ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-10">
          <img src={LOGO_URL} alt="24/7 Pharmacy" className="h-10 w-auto object-contain" />
          {/* Progress dots */}
          <div className="flex items-center gap-1.5">
            {steps.map((s, i) => (
              <div
                key={s}
                className="rounded-full transition-all"
                style={{
                  width: i === stepIndex ? "20px" : "6px",
                  height: "6px",
                  background: i <= stepIndex ? "#2B7FFF" : "#2A2A2E",
                }}
              />
            ))}
          </div>
        </div>

        {/* ── Step: Name ────────────────────────────────────────────────── */}
        {step === "name" && (
          <div className="flex-1 flex flex-col">
            <div className="mb-8">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-5"
                style={{ background: "rgba(43,127,255,0.12)" }}
              >
                <User size={18} style={{ color: "#2B7FFF" }} />
              </div>
              <h1 className="text-xl font-semibold mb-2 leading-snug" style={{ color: "#F0F0F2" }}>
                What should we call you?
              </h1>
              <p className="text-sm leading-relaxed" style={{ color: "#6B6B75" }}>
                Your name will appear on prescriptions and delivery confirmations.
              </p>
            </div>

            <div className="flex-1">
              <input
                type="text"
                placeholder="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && goNext()}
                autoFocus
                className="w-full h-12 px-4 rounded-xl border outline-none text-sm transition-all"
                style={{
                  background: "#141416",
                  borderColor: name ? "#2B7FFF" : "#2A2A2E",
                  color: "#F0F0F2",
                }}
              />
            </div>

            <button
              onClick={goNext}
              disabled={!name.trim()}
              className="w-full h-12 rounded-xl text-sm font-semibold mt-6 flex items-center justify-center gap-2 transition-all"
              style={{
                background: name.trim() ? "#2B7FFF" : "#1A2A3A",
                color: name.trim() ? "#FFFFFF" : "#6B6B75",
              }}
            >
              Continue
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* ── Step: Building ────────────────────────────────────────────── */}
        {step === "building" && (
          <div className="flex-1 flex flex-col">
            <button
              onClick={goBack}
              className="text-sm mb-6 text-left transition-colors"
              style={{ color: "#6B6B75" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#F0F0F2")}
              onMouseLeave={e => (e.currentTarget.style.color = "#6B6B75")}
            >
              ← Back
            </button>

            <div className="mb-6">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-5"
                style={{ background: "rgba(43,127,255,0.12)" }}
              >
                <Building2 size={18} style={{ color: "#2B7FFF" }} />
              </div>
              <h1 className="text-xl font-semibold mb-2 leading-snug" style={{ color: "#F0F0F2" }}>
                Select your building
              </h1>
              <p className="text-sm leading-relaxed" style={{ color: "#6B6B75" }}>
                Your building determines which pharmacy serves you and your delivery time.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 mb-4">
              {buildingsLoading ? (
                [1, 2, 3].map(i => (
                  <div
                    key={i}
                    className="h-16 rounded-xl animate-pulse"
                    style={{ background: "#141416" }}
                  />
                ))
              ) : buildings && buildings.length > 0 ? (
                buildings.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setSelectedBuilding(b.id)}
                    className="w-full text-left px-4 py-3.5 rounded-xl border transition-all flex items-center justify-between"
                    style={{
                      background: selectedBuilding === b.id ? "rgba(43,127,255,0.1)" : "#141416",
                      borderColor: selectedBuilding === b.id ? "#2B7FFF" : "#2A2A2E",
                    }}
                  >
                    <div>
                      <div className="text-sm font-medium" style={{ color: "#F0F0F2" }}>{b.name}</div>
                      {b.address && (
                        <div className="text-xs mt-0.5 flex items-center gap-1" style={{ color: "#6B6B75" }}>
                          <MapPin size={10} />
                          {b.address}
                        </div>
                      )}
                    </div>
                    {selectedBuilding === b.id && (
                      <CheckCircle2 size={16} style={{ color: "#2B7FFF", flexShrink: 0 }} />
                    )}
                  </button>
                ))
              ) : (
                <div
                  className="text-sm text-center py-8 rounded-xl border border-dashed"
                  style={{ color: "#6B6B75", borderColor: "#2A2A2E" }}
                >
                  No buildings configured yet.
                </div>
              )}
            </div>

            <button
              onClick={goNext}
              disabled={!selectedBuilding}
              className="w-full h-12 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all"
              style={{
                background: selectedBuilding ? "#2B7FFF" : "#1A2A3A",
                color: selectedBuilding ? "#FFFFFF" : "#6B6B75",
              }}
            >
              Continue
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* ── Step: Flat ────────────────────────────────────────────────── */}
        {step === "flat" && (
          <div className="flex-1 flex flex-col">
            <button
              onClick={goBack}
              className="text-sm mb-6 text-left transition-colors"
              style={{ color: "#6B6B75" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#F0F0F2")}
              onMouseLeave={e => (e.currentTarget.style.color = "#6B6B75")}
            >
              ← Back
            </button>

            <div className="mb-8">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-5"
                style={{ background: "rgba(43,127,255,0.12)" }}
              >
                <Home size={18} style={{ color: "#2B7FFF" }} />
              </div>
              <h1 className="text-xl font-semibold mb-2 leading-snug" style={{ color: "#F0F0F2" }}>
                Your flat number
              </h1>
              <p className="text-sm leading-relaxed" style={{ color: "#6B6B75" }}>
                Deliveries will be made directly to your door.
              </p>
            </div>

            <div className="flex-1">
              <input
                type="text"
                placeholder="e.g. A-402, Tower 3 – 801"
                value={flatNumber}
                onChange={(e) => setFlatNumber(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && goNext()}
                autoFocus
                className="w-full h-12 px-4 rounded-xl border outline-none text-sm transition-all"
                style={{
                  background: "#141416",
                  borderColor: flatNumber ? "#2B7FFF" : "#2A2A2E",
                  color: "#F0F0F2",
                }}
              />
              {selectedBuildingData && (
                <p className="text-xs mt-2" style={{ color: "#6B6B75" }}>
                  Building: {selectedBuildingData.name}
                </p>
              )}
            </div>

            <button
              onClick={goNext}
              disabled={!flatNumber.trim()}
              className="w-full h-12 rounded-xl text-sm font-semibold mt-6 flex items-center justify-center gap-2 transition-all"
              style={{
                background: flatNumber.trim() ? "#2B7FFF" : "#1A2A3A",
                color: flatNumber.trim() ? "#FFFFFF" : "#6B6B75",
              }}
            >
              Continue
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* ── Step: Confirm ─────────────────────────────────────────────── */}
        {step === "confirm" && (
          <div className="flex-1 flex flex-col">
            <button
              onClick={goBack}
              className="text-sm mb-6 text-left transition-colors"
              style={{ color: "#6B6B75" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#F0F0F2")}
              onMouseLeave={e => (e.currentTarget.style.color = "#6B6B75")}
            >
              ← Back
            </button>

            <div className="mb-8">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-5"
                style={{ background: "rgba(0,200,150,0.12)" }}
              >
                <CheckCircle2 size={18} style={{ color: "#00C896" }} />
              </div>
              <h1 className="text-xl font-semibold mb-2 leading-snug" style={{ color: "#F0F0F2" }}>
                Confirm your details
              </h1>
              <p className="text-sm leading-relaxed" style={{ color: "#6B6B75" }}>
                Your serving pharmacy and delivery address are set based on these details.
              </p>
            </div>

            {/* Summary card */}
            <div
              className="rounded-xl border p-5 space-y-4 mb-6"
              style={{ background: "#141416", borderColor: "#2A2A2E" }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "#6B6B75" }}>Name</span>
                <span className="text-sm font-medium" style={{ color: "#F0F0F2" }}>{name}</span>
              </div>
              <div className="h-px" style={{ background: "#2A2A2E" }} />
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "#6B6B75" }}>Building</span>
                <span className="text-sm font-medium" style={{ color: "#F0F0F2" }}>{selectedBuildingData?.name}</span>
              </div>
              <div className="h-px" style={{ background: "#2A2A2E" }} />
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "#6B6B75" }}>Flat</span>
                <span className="text-sm font-medium" style={{ color: "#F0F0F2" }}>{flatNumber}</span>
              </div>
            </div>

            {/* Pharmacy assignment */}
            <div
              className="flex items-center gap-3 px-4 py-3.5 rounded-xl border mb-6"
              style={{ background: "rgba(0,200,150,0.06)", borderColor: "rgba(0,200,150,0.2)" }}
            >
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#00C896" }} />
              <div>
                <p className="text-xs font-medium" style={{ color: "#00C896" }}>Serving pharmacy assigned</p>
                <p className="text-xs mt-0.5" style={{ color: "#6B6B75" }}>
                  Your local 24/7 pharmacy will handle all your orders.
                </p>
              </div>
            </div>

            <div className="flex-1" />

            <button
              onClick={goNext}
              disabled={completeOnboarding.isPending}
              className="w-full h-12 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all"
              style={{
                background: completeOnboarding.isPending ? "#1A4FAA" : "#2B7FFF",
                color: "#FFFFFF",
                opacity: completeOnboarding.isPending ? 0.7 : 1,
              }}
            >
              {completeOnboarding.isPending ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Setting up your pharmacy…
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  Confirm and enter
                </>
              )}
            </button>

            <p className="text-xs text-center mt-4" style={{ color: "#6B6B75" }}>
              Your address is used only for delivery routing and prescription records.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
