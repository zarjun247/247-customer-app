import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, Phone, Shield, ChevronRight } from "lucide-react";
import { getLoginUrl } from "@/const";

const LOGO_URL = "/manus-storage/247-logo-transparent_ef3d59e3.png";

// ─── Google SVG icon ──────────────────────────────────────────────────────────
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  );
}

// ─── Apple SVG icon ───────────────────────────────────────────────────────────
function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
      <path d="M14.045 9.586c-.02-2.127 1.737-3.154 1.815-3.203--.99-1.447-2.527-1.645-3.075-1.665-1.307-.133-2.56.77-3.222.77-.662 0-1.683-.754-2.771-.733-1.42.02-2.737.826-3.467 2.094-1.48 2.565-.38 6.363 1.063 8.444.706 1.016 1.547 2.155 2.651 2.114 1.07-.042 1.473-.686 2.766-.686 1.294 0 1.662.686 2.793.663 1.148-.02 1.872-1.038 2.573-2.057.812-1.177 1.146-2.318 1.165-2.376-.026-.012-2.233-.855-2.255-3.365h-.036ZM11.98 3.17c.587-.71.983-1.697.875-2.68-.845.034-1.868.563-2.474 1.273-.543.626-1.018 1.627-.89 2.586.942.073 1.903-.479 2.489-1.179Z"/>
    </svg>
  );
}

type AuthStep = "entry" | "phone" | "otp";

export default function Login() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<AuthStep>("entry");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();

  const sendOtp = trpc.auth.sendOtp.useMutation({
    onSuccess: (data) => {
      setDevCode(data.devCode);
      setStep("otp");
    },
    onError: (e) => toast.error(e.message),
  });

  const verifyOtp = trpc.auth.verifyOtp.useMutation({
    onSuccess: (data) => {
      if (data.valid) {
        navigate("/onboarding");
      } else {
        toast.error("That code doesn't match. Please try again.");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSendOtp = () => {
    if (!phone || phone.replace(/\D/g, "").length < 10) {
      toast.error("Enter a valid 10-digit mobile number");
      return;
    }
    const normalized = phone.startsWith("+91") ? phone : `+91${phone.replace(/\D/g, "")}`;
    sendOtp.mutate({ phone: normalized });
  };

  const handleVerifyOtp = () => {
    if (!otp || otp.length !== 6) {
      toast.error("Enter the 6-digit code");
      return;
    }
    const normalized = phone.startsWith("+91") ? phone : `+91${phone.replace(/\D/g, "")}`;
    verifyOtp.mutate({ phone: normalized, code: otp });
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
      {/* ── Back button ─────────────────────────────────────────────────── */}
      {step !== "entry" && (
        <div className="px-5 pt-5">
          <button
            onClick={() => step === "otp" ? setStep("phone") : setStep("entry")}
            className="inline-flex items-center gap-1.5 text-sm transition-colors"
            style={{ color: "#6B6B75" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#F0F0F2")}
            onMouseLeave={e => (e.currentTarget.style.color = "#6B6B75")}
          >
            <ArrowLeft size={15} />
            Back
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col justify-center px-6 py-10 max-w-sm mx-auto w-full">

        {/* ── Logo ──────────────────────────────────────────────────────── */}
        <div className="mb-10 flex justify-center">
          <img
            src={LOGO_URL}
            alt="24/7 Pharmacy"
            className="h-20 w-auto object-contain"
          />
        </div>

        {/* ── Entry screen ──────────────────────────────────────────────── */}
        {step === "entry" && (
          <div className="space-y-3">
            <div className="mb-8 text-center">
              <h1 className="text-xl font-semibold mb-1.5" style={{ color: "#F0F0F2" }}>
                Welcome back
              </h1>
              <p className="text-sm leading-relaxed" style={{ color: "#6B6B75" }}>
                Sign in to access your medications and pharmacy.
              </p>
            </div>

            {/* Google */}
            <button
              onClick={() => window.location.href = getLoginUrl()}
              className="w-full h-12 flex items-center justify-between px-4 rounded-xl border transition-all"
              style={{
                background: "#141416",
                borderColor: "#2A2A2E",
                color: "#F0F0F2",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = "#2B7FFF";
                (e.currentTarget as HTMLElement).style.background = "#1A1A1E";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = "#2A2A2E";
                (e.currentTarget as HTMLElement).style.background = "#141416";
              }}
            >
              <div className="flex items-center gap-3">
                <GoogleIcon />
                <span className="text-sm font-medium">Continue with Google</span>
              </div>
              <ChevronRight size={15} style={{ color: "#6B6B75" }} />
            </button>

            {/* Apple */}
            <button
              onClick={() => toast.info("Apple Sign-In coming soon")}
              className="w-full h-12 flex items-center justify-between px-4 rounded-xl border transition-all"
              style={{
                background: "#141416",
                borderColor: "#2A2A2E",
                color: "#F0F0F2",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = "#3A3A3E";
                (e.currentTarget as HTMLElement).style.background = "#1A1A1E";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = "#2A2A2E";
                (e.currentTarget as HTMLElement).style.background = "#141416";
              }}
            >
              <div className="flex items-center gap-3">
                <AppleIcon />
                <span className="text-sm font-medium">Continue with Apple</span>
              </div>
              <ChevronRight size={15} style={{ color: "#6B6B75" }} />
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 py-2">
              <div className="flex-1 h-px" style={{ background: "#2A2A2E" }} />
              <span className="text-xs" style={{ color: "#6B6B75" }}>or</span>
              <div className="flex-1 h-px" style={{ background: "#2A2A2E" }} />
            </div>

            {/* Phone */}
            <button
              onClick={() => setStep("phone")}
              className="w-full h-12 flex items-center justify-between px-4 rounded-xl border transition-all"
              style={{
                background: "#141416",
                borderColor: "#2A2A2E",
                color: "#F0F0F2",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = "#3A3A3E";
                (e.currentTarget as HTMLElement).style.background = "#1A1A1E";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = "#2A2A2E";
                (e.currentTarget as HTMLElement).style.background = "#141416";
              }}
            >
              <div className="flex items-center gap-3">
                <Phone size={16} style={{ color: "#6B6B75" }} />
                <span className="text-sm font-medium">Continue with phone</span>
              </div>
              <ChevronRight size={15} style={{ color: "#6B6B75" }} />
            </button>

            {/* Trust strip */}
            <div className="pt-6 flex items-center justify-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#00C896" }} />
              <span className="text-xs" style={{ color: "#6B6B75" }}>
                Licensed pharmacy · Secure records · HIPAA-aligned
              </span>
            </div>
          </div>
        )}

        {/* ── Phone entry ───────────────────────────────────────────────── */}
        {step === "phone" && (
          <div>
            <div className="mb-8">
              <h1 className="text-xl font-semibold mb-1.5" style={{ color: "#F0F0F2" }}>
                Enter your number
              </h1>
              <p className="text-sm leading-relaxed" style={{ color: "#6B6B75" }}>
                We'll send a one-time code to verify your identity.
              </p>
            </div>

            <div className="space-y-3">
              <div
                className="flex items-center h-12 rounded-xl border overflow-hidden"
                style={{ background: "#141416", borderColor: "#2A2A2E" }}
              >
                <span
                  className="px-4 text-sm font-medium border-r h-full flex items-center"
                  style={{ color: "#6B6B75", borderColor: "#2A2A2E", background: "#0E0E10" }}
                >
                  +91
                </span>
                <input
                  type="tel"
                  placeholder="98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  className="flex-1 px-4 bg-transparent text-sm outline-none"
                  style={{ color: "#F0F0F2" }}
                  onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
                  autoFocus
                />
              </div>

              <button
                onClick={handleSendOtp}
                disabled={sendOtp.isPending}
                className="w-full h-12 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
                style={{
                  background: sendOtp.isPending ? "#1A4FAA" : "#2B7FFF",
                  color: "#FFFFFF",
                  opacity: sendOtp.isPending ? 0.7 : 1,
                }}
              >
                {sendOtp.isPending ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Sending code...
                  </>
                ) : (
                  <>
                    <Phone size={15} />
                    Send verification code
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── OTP verification ──────────────────────────────────────────── */}
        {step === "otp" && (
          <div>
            <div className="mb-8">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                style={{ background: "rgba(43,127,255,0.12)" }}
              >
                <Shield size={18} style={{ color: "#2B7FFF" }} />
              </div>
              <h1 className="text-xl font-semibold mb-1.5" style={{ color: "#F0F0F2" }}>
                Verify your number
              </h1>
              <p className="text-sm leading-relaxed" style={{ color: "#6B6B75" }}>
                Code sent to +91 {phone.replace(/\D/g, "").replace(/(\d{5})(\d{5})/, "$1 $2")}
              </p>
              {devCode && (
                <div
                  className="mt-3 px-3 py-2 rounded-lg text-xs font-mono inline-block"
                  style={{ background: "rgba(43,127,255,0.1)", color: "#2B7FFF" }}
                >
                  Dev code: {devCode}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <input
                type="text"
                inputMode="numeric"
                placeholder="000 000"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-full h-14 rounded-xl border text-center text-2xl tracking-[0.3em] font-mono outline-none transition-all"
                style={{
                  background: "#141416",
                  borderColor: otp.length === 6 ? "#2B7FFF" : "#2A2A2E",
                  color: "#F0F0F2",
                }}
                onKeyDown={(e) => e.key === "Enter" && handleVerifyOtp()}
                autoFocus
              />

              <button
                onClick={handleVerifyOtp}
                disabled={verifyOtp.isPending || otp.length !== 6}
                className="w-full h-12 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
                style={{
                  background: verifyOtp.isPending || otp.length !== 6 ? "#1A2A3A" : "#2B7FFF",
                  color: verifyOtp.isPending || otp.length !== 6 ? "#6B6B75" : "#FFFFFF",
                }}
              >
                {verifyOtp.isPending ? (
                  <>
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Verifying...
                  </>
                ) : "Verify & Continue"}
              </button>

              <button
                className="w-full text-sm py-2 transition-colors"
                style={{ color: "#6B6B75" }}
                onMouseEnter={e => (e.currentTarget.style.color = "#F0F0F2")}
                onMouseLeave={e => (e.currentTarget.style.color = "#6B6B75")}
                onClick={() => { setStep("phone"); setOtp(""); }}
              >
                Change number
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
