import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  ClipboardList,
  Home,
  Package,
  RefreshCw,
  User,
  ShieldCheck,
  MapPin,
} from "lucide-react";
import { Link, useLocation } from "wouter";

const LOGO_URL = "/manus-storage/247-logo_fa5fce53.jpg";

const NAV_ITEMS = [
  { path: "/catalog",   icon: Home,          label: "Medications" },
  { path: "/orders",    icon: Package,       label: "Orders" },
  { path: "/refills",   icon: RefreshCw,     label: "Schedule" },
  { path: "/rx-upload", icon: ClipboardList, label: "Prescriptions" },
  { path: "/profile",   icon: User,          label: "Account" },
];

// Quiet trust signals shown at the bottom of every page
const TRUST_SIGNALS = [
  "Verified pharmacist",
  "Licensed dispensing",
  "Secure prescription records",
];

// Human-readable ETA string
function etaLabel(mins: number | undefined | null): string {
  if (!mins) return "";
  if (mins <= 20) return `Arriving in ~${mins} min`;
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

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F8FAFB" }}>
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white"
        style={{ borderBottom: "1px solid #E5E7EB" }}>
        <div className="max-w-lg mx-auto px-5 h-14 flex items-center justify-between">
          {/* Logo */}
          <Link href="/catalog" className="flex items-center gap-2.5 no-underline">
            <img
              src={LOGO_URL}
              alt="24/7 Pharmacy"
              className="h-7 w-auto object-contain"
              style={{ imageRendering: "crisp-edges" }}
            />
          </Link>

          <div className="flex items-center gap-3">
            {/* Pharmacy + ETA — desktop */}
            {storeName && (
              <div className="hidden sm:flex flex-col items-end">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#22C55E" }} />
                  <span className="text-xs font-semibold" style={{ color: "#111827" }}>
                    {storeName}
                  </span>
                </div>
                {etaText && (
                  <span className="text-[10px]" style={{ color: "#667085" }}>
                    {etaText}
                  </span>
                )}
              </div>
            )}

            {/* Cart indicator */}
            {cartCount > 0 && (
              <Link
                href="/cart"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full no-underline text-xs font-semibold transition-opacity hover:opacity-80"
                style={{ background: "#1F6FEB", color: "white" }}
              >
                {cartCount} {cartCount === 1 ? "item" : "items"} →
              </Link>
            )}
          </div>
        </div>

        {/* Context strip — mobile */}
        {isAuthenticated && (
          <div className="sm:hidden" style={{ borderTop: "1px solid #E5E7EB", background: "#F8FAFB" }}>
            <div className="max-w-lg mx-auto px-5 py-2 flex items-center gap-2">
              {/* Building + flat */}
              {profile?.buildingName ? (
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <MapPin size={11} strokeWidth={1.75} style={{ color: "#9CA3AF", flexShrink: 0 }} />
                  <span className="text-xs font-medium truncate" style={{ color: "#667085" }}>
                    {profile.buildingName}
                    {profile.flatNumber && (
                      <span style={{ color: "#9CA3AF" }}>, Flat {profile.flatNumber}</span>
                    )}
                  </span>
                </div>
              ) : (
                <div className="flex-1" />
              )}

              {/* Pharmacy open + ETA */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#22C55E" }} />
                <span className="text-xs font-medium" style={{ color: "#22C55E" }}>
                  Pharmacy open
                </span>
                {etaText && (
                  <span className="text-xs" style={{ color: "#9CA3AF" }}>
                    · {etaText}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ── Page content ────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-lg mx-auto w-full pb-20">
        {children}

        {/* ── Trust signal strip ──────────────────────────────────────── */}
        <div className="px-5 py-6 mt-4" style={{ borderTop: "1px solid #E5E7EB" }}>
          <div className="flex flex-wrap gap-x-4 gap-y-2 justify-center">
            {TRUST_SIGNALS.map((signal) => (
              <div key={signal} className="flex items-center gap-1.5">
                <ShieldCheck size={11} strokeWidth={2} style={{ color: "#16A34A", flexShrink: 0 }} />
                <span className="text-[10px] font-medium" style={{ color: "#9CA3AF" }}>
                  {signal}
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ── Bottom navigation ────────────────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white"
        style={{ borderTop: "1px solid #E5E7EB" }}>
        <div className="max-w-lg mx-auto px-2 h-16 flex items-center justify-around">
          {NAV_ITEMS.map(({ path, icon: Icon, label }) => {
            const active = location === path || location.startsWith(path + "/");
            return (
              <Link
                key={path}
                href={path}
                className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl no-underline transition-opacity hover:opacity-70"
              >
                <Icon
                  size={20}
                  strokeWidth={active ? 2 : 1.5}
                  style={{ color: active ? "#1F6FEB" : "#9CA3AF" }}
                />
                <span
                  className="text-[10px] font-medium"
                  style={{ color: active ? "#1F6FEB" : "#9CA3AF" }}
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
