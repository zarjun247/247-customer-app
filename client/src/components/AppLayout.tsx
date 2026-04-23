import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  ClipboardList,
  Home,
  Package,
  RefreshCw,
  ShoppingCart,
  User,
} from "lucide-react";
import { Link, useLocation } from "wouter";

const LOGO_URL = "/manus-storage/247-logo_fa5fce53.jpg";

const NAV_ITEMS = [
  { path: "/catalog", icon: Home, label: "Medicines" },
  { path: "/orders", icon: Package, label: "Orders" },
  { path: "/refills", icon: RefreshCw, label: "Refills" },
  { path: "/rx-upload", icon: ClipboardList, label: "Prescriptions" },
  { path: "/profile", icon: User, label: "Account" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { data: profile } = trpc.user.profile.useQuery(undefined, {
    enabled: !!user,
  });
  const { data: cartItems } = trpc.cart.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const cartCount = cartItems?.reduce((s, i) => s + i.quantity, 0) ?? 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-lg mx-auto px-5 h-14 flex items-center justify-between">
          {/* Logo mark */}
          <Link href="/catalog" className="flex items-center gap-2.5 no-underline">
            <img
              src={LOGO_URL}
              alt="24/7 Pharmacy"
              className="h-7 w-auto object-contain"
              style={{ imageRendering: "crisp-edges" }}
            />
          </Link>

          {/* Right side: node indicator + cart */}
          <div className="flex items-center gap-4">
            {profile?.buildingName && (
              <div className="hidden sm:flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span className="text-muted-foreground text-xs font-medium truncate max-w-[140px]">
                  {profile.buildingName}
                </span>
              </div>
            )}
            <Link
              href="/cart"
              className="relative flex items-center text-muted-foreground hover:text-foreground transition-colors no-underline"
            >
              <ShoppingCart size={20} strokeWidth={1.5} />
              {cartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                  {cartCount > 9 ? "9+" : cartCount}
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* Mobile node indicator strip */}
        {profile?.buildingName && (
          <div className="sm:hidden border-t border-border/50 bg-card/60">
            <div className="max-w-lg mx-auto px-5 py-1.5 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
              <span className="text-muted-foreground text-[11px] font-medium truncate">
                {profile.buildingName}
                {profile.flatNumber && (
                  <span className="text-muted-foreground/60"> · Flat {profile.flatNumber}</span>
                )}
              </span>
              <span className="ml-auto text-[10px] text-primary/70 font-medium tracking-wide uppercase">
                Node Active
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
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border">
        <div className="max-w-lg mx-auto px-2 h-16 flex items-center justify-around">
          {NAV_ITEMS.map(({ path, icon: Icon, label }) => {
            const active = location === path || location.startsWith(path + "/");
            return (
              <Link
                key={path}
                href={path}
                className="flex flex-col items-center gap-1 px-3 py-2 rounded-md transition-colors no-underline"
              >
                <Icon
                  size={20}
                  strokeWidth={active ? 2 : 1.5}
                  className={active ? "text-primary" : "text-muted-foreground"}
                />
                <span
                  className={`text-[10px] font-medium tracking-wide ${
                    active ? "text-primary" : "text-muted-foreground"
                  }`}
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
