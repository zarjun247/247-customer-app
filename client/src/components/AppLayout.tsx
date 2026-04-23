import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  ClipboardList,
  Home,
  Package,
  RefreshCw,
  User,
  ShieldCheck,
} from "lucide-react";
import { Link, useLocation } from "wouter";

const LOGO_URL = "/manus-storage/247-logo-transparent_ef3d59e3.png";

const NAV_ITEMS = [
  { path: "/catalog",   icon: Home,          label: "Medications" },
  { path: "/orders",    icon: Package,       label: "Orders" },
  { path: "/refills",   icon: RefreshCw,     label: "Schedule" },
  { path: "/rx-upload", icon: ClipboardList, label: "Prescriptions" },
  { path: "/profile",   icon: User,          label: "Account" },
];

const TRUST_SIGNALS = [
  "Verified pharmacist",
  "Licensed dispensing",
  "Secure prescription records",
];

function etaLabel(mins: number | undefined | null): string {
  if (!mins) return "";
  if (mins <= 45) return `Arriving in ~${mins} min`;
  return `Arriving in under ${Math.ceil(mins / 60)} hr`;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { data: profile } = trpc.user.profile.useQuery(undefined, { enabled: !!user });
  const { data: store } = trpc.catalog.store.useQuery(undefined, { enabled: isAuthenticated });
  const { data: cartItems } = trpc.cart.get.useQuery(undefined, { enabled: isAuthenticated });

  const cartCount = cartItems?.reduce((s, i) => s + i.quantity, 0) ?? 0;
  const storeName = store?.name ?? null;
  const eta = (store as any)?.etaMins as number | undefined;
  const etaText = etaLabel(eta);

  // Single context line: "Godrej Emerald · 24/7 Pharmacy Kanjurmarg"
  const buildingPart = profile?.buildingName ?? null;
  const contextLine = buildingPart && storeName
    ? `${buildingPart} · ${storeName}`
    : storeName ?? buildingPart ?? null;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0A0A0B", paddingTop: "env(safe-area-inset-top)" }}>
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40" style={{ background: "#0E0E10", borderBottom: "1px solid #2A2A2E", paddingTop: "env(safe-area-inset-top)", marginTop: "calc(-1 * env(safe-area-inset-top))" }}>
        <div className="max-w-lg mx-auto px-5 h-14 flex items-center justify-between">
          {/* Logo */}
          <Link href="/catalog" className="flex items-center gap-2.5 no-underline">
            <img
              src={LOGO_URL}
              alt="24/7 Pharmacy"
              className="h-7 w-auto object-contain"
            />
          </Link>

          <div className="flex items-center gap-3">
            {/* Context — desktop */}
            {isAuthenticated && contextLine && (
              <div className="hidden sm:flex flex-col items-end gap-0.5">
                <span className="text-xs font-medium" style={{ color: "#F0F0F2" }}>
                  {contextLine}
                </span>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#00C896" }} />
                  <span className="text-[10px]" style={{ color: "#00C896" }}>Open now</span>
                  {etaText && (
                    <span className="text-[10px]" style={{ color: "#6B6B75" }}>· {etaText}</span>
                  )}
                </div>
              </div>
            )}

            {/* Cart indicator */}
            {cartCount > 0 && (
              <Link
                href="/cart"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full no-underline text-xs font-semibold transition-opacity hover:opacity-80"
                style={{ background: "#2B7FFF", color: "white" }}
              >
                {cartCount} {cartCount === 1 ? "item" : "items"} →
              </Link>
            )}
          </div>
        </div>

        {/* Context strip — mobile (single compact line) */}
        {isAuthenticated && (
          <div className="sm:hidden" style={{ borderTop: "1px solid #1C1C1F" }}>
            <div className="max-w-lg mx-auto px-5 py-2 flex items-center justify-between gap-3">
              {contextLine && (
                <span className="text-xs font-medium truncate flex-1" style={{ color: "#A0A0A8" }}>
                  {contextLine}
                </span>
              )}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#00C896" }} />
                <span className="text-[10px] font-medium" style={{ color: "#00C896" }}>Open now</span>
                {etaText && (
                  <span className="text-[10px]" style={{ color: "#6B6B75" }}>· {etaText}</span>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ── Page content ────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-lg mx-auto w-full" style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom))" }}>
        {children}

        {/* ── Trust signal strip ──────────────────────────────────────── */}
        <div className="px-5 py-6 mt-4" style={{ borderTop: "1px solid #2A2A2E" }}>
          <div className="flex flex-wrap gap-x-4 gap-y-2 justify-center">
            {TRUST_SIGNALS.map((signal) => (
              <div key={signal} className="flex items-center gap-1.5">
                <ShieldCheck size={11} strokeWidth={1.75} style={{ color: "#00C896", flexShrink: 0 }} />
                <span className="text-[10px] font-medium" style={{ color: "#6B6B75" }}>
                  {signal}
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ── Bottom navigation ────────────────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50"
        style={{ background: "#0E0E10", borderTop: "1px solid #2A2A2E", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="max-w-lg mx-auto px-2 h-16 flex items-center justify-around">
          {NAV_ITEMS.map(({ path, icon: Icon, label }) => {
            const active = location === path || location.startsWith(path + "/");
            return (
              <Link
                key={path}
                href={path}
                className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl no-underline transition-opacity hover:opacity-80"
              >
                <Icon
                  size={20}
                  strokeWidth={active ? 2 : 1.5}
                  style={{ color: active ? "#2B7FFF" : "#4B4B55" }}
                />
                <span
                  className="text-[10px] font-medium"
                  style={{ color: active ? "#2B7FFF" : "#4B4B55" }}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
