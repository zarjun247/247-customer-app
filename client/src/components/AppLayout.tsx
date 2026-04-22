import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { ShoppingCart, Search, Package, FileText, Bell, User, Home } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";

const LOGO_URL = "/manus-storage/247-logo_fa5fce53.jpg";

const navItems = [
  { href: "/catalog", icon: Home, label: "Home" },
  { href: "/orders", icon: Package, label: "Orders" },
  { href: "/rx-upload", icon: FileText, label: "Rx" },
  { href: "/refills", icon: Bell, label: "Refills" },
  { href: "/profile", icon: User, label: "Profile" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { isAuthenticated } = useAuth();
  const { data: cartItems } = trpc.cart.get.useQuery(undefined, { enabled: isAuthenticated });
  const cartCount = cartItems?.reduce((s, i) => s + i.quantity, 0) ?? 0;

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-md mx-auto relative">
      {/* Top Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <Link href="/catalog">
            <img src={LOGO_URL} alt="24/7 Pharmacy" className="h-8 w-auto object-contain" />
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/catalog" className="text-muted-foreground hover:text-foreground transition-colors">
              <Search className="h-5 w-5" />
            </Link>
            <Link href="/cart" className="relative text-muted-foreground hover:text-foreground transition-colors">
              <ShoppingCart className="h-5 w-5" />
              {cartCount > 0 && (
                <Badge className="absolute -top-2 -right-2 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-primary text-primary-foreground border-0">
                  {cartCount > 9 ? "9+" : cartCount}
                </Badge>
              )}
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-card/95 backdrop-blur-sm border-t border-border z-50">
        <div className="flex items-center justify-around px-2 py-2">
          {navItems.map(({ href, icon: Icon, label }) => {
            const isActive = location === href || location.startsWith(href + "/");
            return (
              <Link key={href} href={href} className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg transition-colors ${isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium tracking-wide">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
