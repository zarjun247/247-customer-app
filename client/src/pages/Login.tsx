import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, Phone, Shield } from "lucide-react";
import { Link } from "wouter";
import { getLoginUrl } from "@/const";

const LOGO_URL = "/manus-storage/247-logo_fa5fce53.jpg";

export default function Login() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();

  const sendOtp = trpc.auth.sendOtp.useMutation({
    onSuccess: (data) => {
      setDevCode(data.devCode);
      setStep("otp");
      toast.success("OTP sent to your phone");
    },
    onError: (e) => toast.error(e.message),
  });

  const verifyOtp = trpc.auth.verifyOtp.useMutation({
    onSuccess: (data) => {
      if (data.valid) {
        toast.success("Verified! Redirecting...");
        navigate("/onboarding");
      } else {
        toast.error("Invalid OTP. Please try again.");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSendOtp = () => {
    if (!phone || phone.length < 10) { toast.error("Enter a valid phone number"); return; }
    sendOtp.mutate({ phone: phone.startsWith("+91") ? phone : `+91${phone}` });
  };

  const handleVerifyOtp = () => {
    if (!otp || otp.length !== 6) { toast.error("Enter the 6-digit OTP"); return; }
    verifyOtp.mutate({ phone: phone.startsWith("+91") ? phone : `+91${phone}`, code: otp });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="px-6 pt-8">
        <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      </div>

      <div className="flex-1 flex flex-col justify-center px-6 py-8 max-w-sm mx-auto w-full">
        <img src={LOGO_URL} alt="24/7" className="h-12 w-12 object-contain rounded-xl mb-8" />

        {step === "phone" ? (
          <>
            <div className="mb-8">
              <h1 className="text-2xl font-semibold text-foreground mb-2">Sign in</h1>
              <p className="text-muted-foreground text-sm">Enter your mobile number to receive a one-time password.</p>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">+91</span>
                <Input
                  type="tel"
                  placeholder="98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  className="pl-12 h-12 bg-input border-border text-foreground placeholder:text-muted-foreground"
                  onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
                />
              </div>
              <Button
                className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
                onClick={handleSendOtp}
                disabled={sendOtp.isPending}
              >
                {sendOtp.isPending ? (
                  <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />Sending...</span>
                ) : (
                  <span className="flex items-center gap-2"><Phone className="h-4 w-4" />Send OTP</span>
                )}
              </Button>
            </div>

            <div className="mt-8 pt-8 border-t border-border">
              <p className="text-xs text-muted-foreground text-center mb-3">Or continue with</p>
              <Button
                variant="outline"
                className="w-full h-11 border-border text-foreground hover:bg-secondary text-sm"
                onClick={() => window.location.href = getLoginUrl()}
              >
                Sign in with Manus
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-8">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <h1 className="text-2xl font-semibold text-foreground mb-2">Verify OTP</h1>
              <p className="text-muted-foreground text-sm">
                Enter the 6-digit code sent to +91 {phone}.
              </p>
              {devCode && (
                <p className="text-xs text-primary mt-2 font-mono bg-primary/10 px-3 py-1.5 rounded-lg inline-block">
                  Dev code: {devCode}
                </p>
              )}
            </div>

            <div className="space-y-4">
              <Input
                type="text"
                inputMode="numeric"
                placeholder="000000"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="h-12 text-center text-xl tracking-widest font-mono bg-input border-border text-foreground placeholder:text-muted-foreground"
                onKeyDown={(e) => e.key === "Enter" && handleVerifyOtp()}
              />
              <Button
                className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
                onClick={handleVerifyOtp}
                disabled={verifyOtp.isPending}
              >
                {verifyOtp.isPending ? (
                  <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />Verifying...</span>
                ) : "Verify & Continue"}
              </Button>
              <button
                className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setStep("phone")}
              >
                Change number
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
