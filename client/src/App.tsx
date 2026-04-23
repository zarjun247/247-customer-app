import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import { useState, useCallback, useEffect } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import SplashScreen from "./components/SplashScreen";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import Catalog from "./pages/Catalog";
import Cart from "./pages/Cart";
import Orders from "./pages/Orders";
import OrderDetail from "./pages/OrderDetail";
import RxUpload from "./pages/RxUpload";
import Profile from "./pages/Profile";
import Invoices from "./pages/Invoices";
import RefillReminders from "./pages/RefillReminders";
import { useAuth } from "./_core/hooks/useAuth";
import { trpc } from "./lib/trpc";

// ── Show splash only once per session ────────────────────────────────────────
const SPLASH_KEY = "247_splash_shown";
function shouldShowSplash(): boolean {
  try {
    if (sessionStorage.getItem(SPLASH_KEY)) return false;
    return true;
  } catch {
    return true;
  }
}

// ── Public routes that bypass the onboarding guard ───────────────────────────
const PUBLIC_ROUTES = ["/login", "/onboarding"];

/**
 * OnboardingGuard
 * After authentication, checks if the user has completed onboarding.
 * If not, redirects to /onboarding — regardless of which route they tried to access.
 */
function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  // Only fetch profile when authenticated and not on a public route
  const isPublicRoute = PUBLIC_ROUTES.some(r => location.startsWith(r));
  const { data: profile, isLoading: profileLoading } = trpc.user.profile.useQuery(
    undefined,
    { enabled: isAuthenticated && !isPublicRoute }
  );

  useEffect(() => {
    // Wait until auth and profile are resolved
    if (authLoading || profileLoading) return;
    // Not authenticated — let Login page handle it
    if (!isAuthenticated || !user) return;
    // Already on a public route — no redirect needed
    if (isPublicRoute) return;
    // Profile loaded and onboarding not complete → redirect
    if (profile && !profile.onboardingComplete) {
      navigate("/onboarding");
    }
  }, [authLoading, profileLoading, isAuthenticated, user, profile, isPublicRoute, navigate]);

  return <>{children}</>;
}

function Router() {
  return (
    <OnboardingGuard>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/login" component={Login} />
        <Route path="/onboarding" component={Onboarding} />
        <Route path="/catalog" component={Catalog} />
        <Route path="/cart" component={Cart} />
        <Route path="/orders" component={Orders} />
        <Route path="/orders/:id" component={OrderDetail} />
        <Route path="/rx-upload" component={RxUpload} />
        <Route path="/profile" component={Profile} />
        <Route path="/invoices" component={Invoices} />
        <Route path="/refills" component={RefillReminders} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </OnboardingGuard>
  );
}

function App() {
  const [showSplash, setShowSplash] = useState(() => shouldShowSplash());

  const handleSplashComplete = useCallback(() => {
    try { sessionStorage.setItem(SPLASH_KEY, "1"); } catch { /* ignore */ }
    setShowSplash(false);
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          {/* Splash renders on top of everything, dismissed after sequence */}
          {showSplash && (
            <SplashScreen onComplete={handleSplashComplete} />
          )}
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
