import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { ArrowRight, Building2, Clock, Shield } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";

const LOGO_URL = "/manus-storage/247-logo_fa5fce53.jpg";

export default function Home() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate("/catalog");
    }
  }, [isAuthenticated, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col justify-center px-8 max-w-lg mx-auto w-full">
        <div className="mb-12">
          <img
            src={LOGO_URL}
            alt="24/7 Pharmacy"
            className="h-12 w-auto object-contain mb-10"
          />

          <h1 className="text-3xl font-semibold text-foreground leading-tight tracking-tight mb-4">
            Pharmacy infrastructure<br />
            for your building.
          </h1>

          <p className="text-muted-foreground text-base leading-relaxed max-w-xs">
            Medicines dispensed from a licensed local pharmacy assigned to your residential complex.
            Deterministic delivery. Pharmacist-gated prescriptions.
          </p>
        </div>

        {/* ── Pillars ───────────────────────────────────────────────────── */}
        <div className="space-y-4 mb-12">
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-md bg-card border border-border flex items-center justify-center flex-shrink-0 mt-0.5">
              <Building2 size={15} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Building-first routing</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Your order is fulfilled from the 24/7 pharmacy serving your building.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-md bg-card border border-border flex items-center justify-center flex-shrink-0 mt-0.5">
              <Clock size={15} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Committed SLA windows</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Delivery time is calculated from live pharmacy capacity, not estimated.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-md bg-card border border-border flex items-center justify-center flex-shrink-0 mt-0.5">
              <Shield size={15} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Pharmacist-reviewed prescriptions</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Every Schedule H dispensation is reviewed and approved by a licensed pharmacist.
              </p>
            </div>
          </div>
        </div>

        {/* ── CTA ──────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <a
            href={getLoginUrl()}
            className="flex items-center justify-between w-full bg-primary text-primary-foreground px-5 py-3.5 rounded-lg font-medium text-sm hover:bg-primary/90 transition-colors no-underline"
          >
            <span>Access your pharmacy</span>
            <ArrowRight size={16} />
          </a>

          <p className="text-center text-[11px] text-muted-foreground">
            For residents of registered 24/7 partner buildings only.
          </p>
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="px-8 py-6 max-w-lg mx-auto w-full">
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            Licensed under Maharashtra Pharmacy Act
          </p>
          <p className="text-[11px] text-muted-foreground">
            Reg. No. MH/PH/2024/001
          </p>
        </div>
      </footer>
    </div>
  );
}
