import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { User, Building2, Home, LogOut, ChevronRight, Package, FileText, Bell } from "lucide-react";
import { useLocation } from "wouter";

export default function Profile() {
  const { isAuthenticated, logout } = useAuth();
  const [, navigate] = useLocation();

  const { data: profile } = trpc.user.profile.useQuery(undefined, { enabled: isAuthenticated });

  const navLinks = [
    { icon: Package, label: "Order History", href: "/orders" },
    { icon: FileText, label: "Prescriptions", href: "/rx-upload" },
    { icon: Bell, label: "Refill Reminders", href: "/refills" },
  ];

  return (
    <AppLayout>
      <div className="px-4 pt-4">
        <h1 className="text-lg font-semibold text-foreground mb-6">Profile</h1>

        {/* User card */}
        <div className="bg-card rounded-xl border border-border p-4 mb-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">{profile?.name ?? "—"}</p>
              <p className="text-sm text-muted-foreground">{profile?.email ?? profile?.phone ?? "—"}</p>
            </div>
          </div>

          <div className="space-y-2">
            {profile?.buildingId && (
              <div className="flex items-center gap-2 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-muted-foreground">Building ID:</span>
                <span className="text-foreground font-medium">{profile.buildingId}</span>
              </div>
            )}
            {profile?.flatNumber && (
              <div className="flex items-center gap-2 text-sm">
                <Home className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-muted-foreground">Flat:</span>
                <span className="text-foreground font-medium">{profile.flatNumber}</span>
              </div>
            )}
            {profile?.assignedStoreId && (
              <div className="flex items-center gap-2 text-sm">
                <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                </div>
                <span className="text-muted-foreground">Pharmacy Node:</span>
                <span className="text-foreground font-medium">Node #{profile.assignedStoreId}</span>
              </div>
            )}
          </div>
        </div>

        {/* Navigation links */}
        <div className="bg-card rounded-xl border border-border overflow-hidden mb-5">
          {navLinks.map(({ icon: Icon, label, href }, idx) => (
            <button
              key={href}
              onClick={() => navigate(href)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-secondary transition-colors text-left ${
                idx < navLinks.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm text-foreground flex-1">{label}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>

        {/* Sign out */}
        <Button
          variant="outline"
          className="w-full h-11 border-destructive/30 text-destructive hover:bg-destructive/10 hover:border-destructive/50"
          onClick={() => logout()}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>

        <p className="text-xs text-muted-foreground text-center mt-6">
          24/7 Pharmacy · Pharmacy-first, India-built
        </p>
      </div>
    </AppLayout>
  );
}
