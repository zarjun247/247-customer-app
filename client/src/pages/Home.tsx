import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

const LOGO_URL = "/manus-storage/247-logo_fa5fce53.jpg";

export default function Home() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  const { data: profile } = trpc.user.profile.useQuery(undefined, { enabled: isAuthenticated });

  useEffect(() => {
    if (!loading && isAuthenticated) {
      if (profile && !profile.onboardingComplete) {
        navigate("/onboarding");
      } else if (profile?.onboardingComplete) {
        navigate("/catalog");
      }
    }
  }, [loading, isAuthenticated, profile, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <img src={LOGO_URL} alt="24/7 Pharmacy" className="h-24 w-24 object-contain rounded-2xl mb-10" />
        <h1 className="text-3xl font-semibold text-foreground tracking-tight mb-3">
          Instant Care.<br />Infinite Trust.
        </h1>
        <p className="text-muted-foreground text-base max-w-xs leading-relaxed mb-12">
          Your building's pharmacy node. Medicines delivered to your door, pharmacist-verified, every time.
        </p>

        <div className="w-full max-w-xs space-y-3">
          <Button
            className="w-full h-12 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => navigate("/login")}
          >
            Get Started
          </Button>
          <Button
            variant="outline"
            className="w-full h-12 text-sm font-medium border-border text-foreground hover:bg-secondary"
            onClick={() => window.location.href = getLoginUrl()}
          >
            Sign in with Manus
          </Button>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 pb-8 text-center">
        <p className="text-xs text-muted-foreground">
          Pharmacy-first. Prescription-compliant. India-built.
        </p>
      </div>
    </div>
  );
}
