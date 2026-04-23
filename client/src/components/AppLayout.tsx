import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  ClipboardList,
  Home,
  Package,
  RefreshCw,
  User,
} from "lucide-react";
import { Link, useLocation } from "wouter";

const LOGO_URL = "/manus-storage/247-logo_fa5fce53.jpg";

const NAV_ITEMS = [
  { path: "/catalog",  icon: Home,          label: "Medications" },
  { path: "/orders",   icon: Package,       label: "Orders" },
  { path: "/refills",  icon: RefreshCw,     label: "Schedule" },
  { path: "/rx-upload",icon: ClipboardList, label: "Prescriptions" },
  { path: "/profile",  icon: User,          label: "Account" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { data: profile } = trpc.user.profile.useQuery(undefined, { enabled: !!user });
  const { data: cartItems } = trpc.cart.get.useQuery(undefined, { enabled: isAuthenticated });
  const cartCount = cartItems?.reduce((s, i) => s + i.quantity, 0) ?? 0;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "oklch(0.990 0.000 0)" }}>
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white"
        style={{ borderBottom: "1px solid oklch(0.910 0.008 255)" }}>
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
            {/* Location — desktop */}
            {profile?.buildingName && (
              <div className="hidden sm:flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: "oklch(0.600 0.160 145)" }} />
                <span className="text-xs font-medium truncate max-w-[160px]"
                  style={{ color: "oklch(0.520 0.018 255)" }}>
                  {profile.buildingName}
                </span>
              </div>
            )}

            {/* Cart indicator */}
            {cartCount > 0 && (
              <Link
                href="/cart"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full no-underline text-xs font-semibold transition-opacity hover:opacity-80"
                style={{ background: "oklch(0.545 0.195 255)", color: "white" }}
              >
                {cartCount} {cartCount === 1 ? "item" : "items"} →
              </Link>
            )}
          </div>
        </div>

        {/* Location strip — mobile */}
        {profile?.buildingName && (
          <div className="sm:hidden" style={{ borderTop: "1px solid oklch(0.910 0.008 255)", background: "oklch(0.990 0.000 0)" }}>
            <div className="max-w-lg mx-auto px-5 py-2 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: "oklch(0.600 0.160 145)" }} />
              <span className="text-xs font-medium truncate"
                style={{ color: "oklch(0.520 0.018 255)" }}>
                {profile.buildingName}
                {profile.flatNumber && (
                  <span style={{ color: "oklch(0.650 0.012 255)" }}> · Flat {profile.flatNumber}</span>
                )}
              </span>
              <span className="ml-auto text-xs font-medium"
                style={{ color: "oklch(0.600 0.160 145)" }}>
                Pharmacy open
              </span>
            </div>
          </div>
        )}
      </header>

      {/* ── Page content ────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-lg mx-auto w-full pb-20">
        {children}
      </main>

      {/* ── Bottom navigation ────────────────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white"
        style={{ borderTop: "1px solid oklch(0.910 0.008 255)" }}>
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
                  style={{ color: active ? "oklch(0.545 0.195 255)" : "oklch(0.650 0.012 255)" }}
                />
                <span
                  className="text-[10px] font-medium"
                  style={{ color: active ? "oklch(0.545 0.195 255)" : "oklch(0.650 0.012 255)" }}
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
