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
import PharmacistWorkbench from "./pages/PharmacistWorkbench";
import PharmacyOS from "./pages/PharmacyOS";
import FounderDashboard from "./pages/FounderDashboard";
import InvoiceIngestion from "./pages/InvoiceIngestion";
import Helpdesk from "./pages/Helpdesk";
import Consent from "./pages/Consent";
import DoctorConsult from "./pages/DoctorConsult";
import ExpiryDashboard from "./pages/ExpiryDashboard";
import BarcodePrint from "./pages/BarcodePrint";
import GstExport from "./pages/GstExport";
import SlaBoard from "./pages/SlaBoard";
import MedivisionSync from "./pages/MedivisionSync";
import PurchaseEntry from "./pages/PurchaseEntry";
import OcrIngestion from "./pages/OcrIngestion";
import Reports from "./pages/Reports";
import MasterData from "./pages/MasterData";
import ShiftClosing from "./pages/ShiftClosing";
import FamilyProfiles from "./pages/FamilyProfiles";
import RefillCalendar from "./pages/RefillCalendar";
import MyMedicines from "./pages/MyMedicines";
import PrivacySettings from "./pages/PrivacySettings";
import { useAuth } from "./_core/hooks/useAuth";
import { trpc } from "./lib/trpc";
import { AdminRoutes } from "./routes/adminRoutes";
import { ADMIN_ROLES, STAFF_ROLES } from "./routes/roleGuards";
import { PhaseProvider } from "./lib/featureFlags";

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
/**
 * ProtectedRoute
 * Wraps a single protected page with 3-case guard logic:
 *   Case A: not authenticated → redirect to /login
 *   Case B: authenticated but onboarding incomplete or no store assigned → redirect to /onboarding
 *   Case C: authenticated + onboarded + store assigned → render children
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { data: profile, isLoading: profileLoading } =
    trpc.user.profile.useQuery(undefined, { enabled: isAuthenticated });

  useEffect(() => {
    if (authLoading) return;
    // Case A: not authenticated
    if (!isAuthenticated) {
      navigate(`/login?return=${encodeURIComponent(location)}`);
      return;
    }
    if (profileLoading) return;
    // Case B: authenticated but onboarding incomplete or no store assigned
    if (profile && (!profile.onboardingComplete || !profile.assignedStoreId)) {
      navigate("/onboarding");
    }
  }, [
    authLoading,
    profileLoading,
    isAuthenticated,
    profile,
    location,
    navigate,
  ]);

  // Show nothing while resolving — individual pages show their own skeletons via useOnboardingGuard
  if (authLoading || (!isAuthenticated && !authLoading)) return null;
  return <>{children}</>;
}

function RestrictedRoute({
  children,
  allow,
}: {
  children: React.ReactNode;
  allow: Set<string>;
}) {
  const [location, navigate] = useLocation();
  const { isAuthenticated, user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      navigate(`/login?return=${encodeURIComponent(location)}`);
      return;
    }
    if (!user || !allow.has(user.role)) {
      navigate("/404");
    }
  }, [allow, authLoading, isAuthenticated, location, navigate, user]);

  if (authLoading || !isAuthenticated || !user || !allow.has(user.role))
    return null;
  return <>{children}</>;
}

/**
 * OnboardingGuard (legacy wrapper — kept for non-route-level usage)
 * Wraps the entire router and handles the onboarding redirect for authenticated users.
 */
function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const isPublicRoute = PUBLIC_ROUTES.some(r => location.startsWith(r));
  const { data: profile, isLoading: profileLoading } =
    trpc.user.profile.useQuery(undefined, {
      enabled: isAuthenticated && !isPublicRoute,
    });
  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!isAuthenticated || !user) return;
    if (isPublicRoute) return;
    if (profile && (!profile.onboardingComplete || !profile.assignedStoreId)) {
      navigate("/onboarding");
    }
  }, [
    authLoading,
    profileLoading,
    isAuthenticated,
    user,
    profile,
    isPublicRoute,
    navigate,
  ]);
  return <>{children}</>;
}

function Router() {
  return (
    <OnboardingGuard>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/login" component={Login} />
        <Route path="/onboarding" component={Onboarding} />
        <Route path="/catalog">
          {() => (
            <ProtectedRoute>
              <Catalog />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/cart">
          {() => (
            <ProtectedRoute>
              <Cart />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/orders">
          {() => (
            <ProtectedRoute>
              <Orders />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/orders/:id">
          {() => (
            <ProtectedRoute>
              <OrderDetail />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/rx-upload">
          {() => (
            <ProtectedRoute>
              <RxUpload />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/profile">
          {() => (
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/invoices">
          {() => (
            <ProtectedRoute>
              <Invoices />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/refills">
          {() => (
            <ProtectedRoute>
              <RefillReminders />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/family">
          {() => (
            <ProtectedRoute>
              <FamilyProfiles />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/refill-calendar">
          {() => (
            <ProtectedRoute>
              <RefillCalendar />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/my-medicines">
          {() => (
            <ProtectedRoute>
              <MyMedicines />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/privacy">
          {() => (
            <ProtectedRoute>
              <PrivacySettings />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/workbench">
          {() => (
            <RestrictedRoute allow={STAFF_ROLES}>
              <PharmacistWorkbench />
            </RestrictedRoute>
          )}
        </Route>
        <Route path="/pharmacy-os">
          {() => (
            <RestrictedRoute allow={STAFF_ROLES}>
              <PharmacyOS />
            </RestrictedRoute>
          )}
        </Route>
        <Route path="/dashboard">
          {() => (
            <RestrictedRoute allow={ADMIN_ROLES}>
              <FounderDashboard />
            </RestrictedRoute>
          )}
        </Route>
        <Route path="/ingestion">
          {() => (
            <ProtectedRoute>
              <InvoiceIngestion />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/helpdesk">
          {() => (
            <ProtectedRoute>
              <Helpdesk />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/consent">
          {() => (
            <ProtectedRoute>
              <Consent />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/doctor-consult">
          {() => (
            <ProtectedRoute>
              <DoctorConsult />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/pharmacy/expiry">
          {() => (
            <RestrictedRoute allow={STAFF_ROLES}>
              <ExpiryDashboard />
            </RestrictedRoute>
          )}
        </Route>
        <Route path="/pharmacy/barcodes">
          {() => (
            <RestrictedRoute allow={STAFF_ROLES}>
              <BarcodePrint />
            </RestrictedRoute>
          )}
        </Route>
        <Route path="/pharmacy/gst-export">
          {() => (
            <RestrictedRoute allow={STAFF_ROLES}>
              <GstExport />
            </RestrictedRoute>
          )}
        </Route>
        <Route path="/pharmacy/sla">
          {() => (
            <RestrictedRoute allow={STAFF_ROLES}>
              <SlaBoard />
            </RestrictedRoute>
          )}
        </Route>
        <Route path="/pharmacy/medivision">
          {() => (
            <RestrictedRoute allow={STAFF_ROLES}>
              <MedivisionSync />
            </RestrictedRoute>
          )}
        </Route>
        <Route path="/pharmacy/purchase">
          {() => (
            <RestrictedRoute allow={STAFF_ROLES}>
              <PurchaseEntry />
            </RestrictedRoute>
          )}
        </Route>
        <Route path="/pharmacy/ocr">
          {() => (
            <RestrictedRoute allow={STAFF_ROLES}>
              <OcrIngestion />
            </RestrictedRoute>
          )}
        </Route>
        <Route path="/pharmacy/reports">
          {() => (
            <RestrictedRoute allow={STAFF_ROLES}>
              <Reports />
            </RestrictedRoute>
          )}
        </Route>
        <Route path="/pharmacy/master-data">
          {() => (
            <RestrictedRoute allow={STAFF_ROLES}>
              <MasterData />
            </RestrictedRoute>
          )}
        </Route>
        <Route path="/pharmacy/shift">
          {() => (
            <RestrictedRoute allow={STAFF_ROLES}>
              <ShiftClosing />
            </RestrictedRoute>
          )}
        </Route>
        {/* Admin area */}
        <AdminRoutes RestrictedRoute={RestrictedRoute} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </OnboardingGuard>
  );
}

function App() {
  const [showSplash, setShowSplash] = useState(() => shouldShowSplash());

  const handleSplashComplete = useCallback(() => {
    try {
      sessionStorage.setItem(SPLASH_KEY, "1");
    } catch {
      /* ignore */
    }
    setShowSplash(false);
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <PhaseProvider>
          <TooltipProvider>
            <Toaster />
            {/* Splash renders on top of everything, dismissed after sequence */}
            {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
            <Router />
          </TooltipProvider>
        </PhaseProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
