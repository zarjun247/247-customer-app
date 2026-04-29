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
import AdminCommandCenter from "./pages/AdminCommandCenter";
import AdminOrders from "./pages/AdminOrders";
import AdminPrescriptions from "./pages/AdminPrescriptions";
import CounterSale from "./pages/CounterSale";
import AdminReports from "./pages/AdminReports";
import AdminInventory from "./pages/AdminInventory";
import AdminCurrentStock from "./pages/inventory/AdminCurrentStock";
import AdminBatchwiseBalance from "./pages/inventory/AdminBatchwiseBalance";
import AdminNearExpiry from "./pages/inventory/AdminNearExpiry";
import AdminStockMovements from "./pages/inventory/AdminStockMovements";
import AdminStockAdjustment from "./pages/inventory/AdminStockAdjustment";
import AdminStockAudit from "./pages/inventory/AdminStockAudit";
import AdminCustomers from "./pages/AdminCustomers";
import AdminRiders from "./pages/AdminRiders";
import AdminWhatsApp from "./pages/AdminWhatsApp";
import AdminRefills from "./pages/AdminRefills";
import AdminAccounting from "./pages/AdminAccounting";
import AdminUtilities from "./pages/AdminUtilities";
import AdminSettings from "./pages/AdminSettings";
import AdminMastersIndex from "./pages/masters/AdminMastersIndex";
import AdminSuppliers from "./pages/masters/AdminSuppliers";
import AdminManufacturers from "./pages/masters/AdminManufacturers";
import AdminCategories from "./pages/masters/AdminCategories";
import AdminGenerics from "./pages/masters/AdminGenerics";
import AdminSchedules from "./pages/masters/AdminSchedules";
import AdminDiscountCategories from "./pages/masters/AdminDiscountCategories";
import AdminDoctors from "./pages/masters/AdminDoctors";
import AdminPatientCategories from "./pages/masters/AdminPatientCategories";
import AdminStaff from "./pages/masters/AdminStaff";
import AdminStores from "./pages/masters/AdminStores";
import AdminBuildings from "./pages/masters/AdminBuildings";
import AdminPrinters from "./pages/masters/AdminPrinters";
import AdminProducts from "./pages/masters/AdminProducts";
import AdminPurchaseInvoices from "./pages/purchase/AdminPurchaseInvoices";
import AdminPurchaseReturns from "./pages/purchase/AdminPurchaseReturns";
import AdminSupplierPayments from "./pages/purchase/AdminSupplierPayments";
import AdminPurchaseReports from "./pages/purchase/AdminPurchaseReports";
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
  const { data: profile, isLoading: profileLoading } = trpc.user.profile.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

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
  }, [authLoading, profileLoading, isAuthenticated, profile, location, navigate]);

  // Show nothing while resolving — individual pages show their own skeletons via useOnboardingGuard
  if (authLoading || (!isAuthenticated && !authLoading)) return null;
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
  const { data: profile, isLoading: profileLoading } = trpc.user.profile.useQuery(
    undefined,
    { enabled: isAuthenticated && !isPublicRoute }
  );
  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!isAuthenticated || !user) return;
    if (isPublicRoute) return;
    if (profile && (!profile.onboardingComplete || !profile.assignedStoreId)) {
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
        <Route path="/catalog">{() => <ProtectedRoute><Catalog /></ProtectedRoute>}</Route>
        <Route path="/cart">{() => <ProtectedRoute><Cart /></ProtectedRoute>}</Route>
        <Route path="/orders">{() => <ProtectedRoute><Orders /></ProtectedRoute>}</Route>
        <Route path="/orders/:id">{() => <ProtectedRoute><OrderDetail /></ProtectedRoute>}</Route>
        <Route path="/rx-upload">{() => <ProtectedRoute><RxUpload /></ProtectedRoute>}</Route>
        <Route path="/profile">{() => <ProtectedRoute><Profile /></ProtectedRoute>}</Route>
        <Route path="/invoices">{() => <ProtectedRoute><Invoices /></ProtectedRoute>}</Route>
        <Route path="/refills">{() => <ProtectedRoute><RefillReminders /></ProtectedRoute>}</Route>
        <Route path="/workbench" component={PharmacistWorkbench} />
        <Route path="/pharmacy-os" component={PharmacyOS} />
        <Route path="/dashboard" component={FounderDashboard} />
        <Route path="/ingestion">{() => <ProtectedRoute><InvoiceIngestion /></ProtectedRoute>}</Route>
        <Route path="/helpdesk">{() => <ProtectedRoute><Helpdesk /></ProtectedRoute>}</Route>
        <Route path="/consent">{() => <ProtectedRoute><Consent /></ProtectedRoute>}</Route>
        <Route path="/doctor-consult">{() => <ProtectedRoute><DoctorConsult /></ProtectedRoute>}</Route>
        <Route path="/pharmacy/expiry" component={ExpiryDashboard} />
        <Route path="/pharmacy/barcodes" component={BarcodePrint} />
        <Route path="/pharmacy/gst-export" component={GstExport} />
        <Route path="/pharmacy/sla" component={SlaBoard} />
        <Route path="/pharmacy/medivision" component={MedivisionSync} />
        <Route path="/pharmacy/purchase" component={PurchaseEntry} />
        <Route path="/pharmacy/ocr" component={OcrIngestion} />
        <Route path="/pharmacy/reports" component={Reports} />
        <Route path="/pharmacy/master-data" component={MasterData} />
        <Route path="/pharmacy/shift" component={ShiftClosing} />
        {/* Admin area */}
        <Route path="/admin" component={AdminCommandCenter} />
        <Route path="/admin/command-center" component={AdminCommandCenter} />
        <Route path="/admin/orders" component={AdminOrders} />
        <Route path="/admin/prescriptions" component={AdminPrescriptions} />
        <Route path="/admin/sales/counter" component={CounterSale} />
        <Route path="/admin/reports" component={AdminReports} />
        <Route path="/admin/purchase">{() => <AdminPurchaseInvoices />}</Route>
        <Route path="/admin/purchase/invoices">{() => <AdminPurchaseInvoices />}</Route>
        <Route path="/admin/purchase/returns">{() => <AdminPurchaseReturns />}</Route>
        <Route path="/admin/purchase/payments">{() => <AdminSupplierPayments />}</Route>
        <Route path="/admin/purchase/reports">{() => <AdminPurchaseReports />}</Route>
        <Route path="/admin/ocr" component={OcrIngestion} />
        <Route path="/admin/master-data" component={MasterData} />
        <Route path="/admin/shift" component={ShiftClosing} />
        <Route path="/admin/expiry" component={ExpiryDashboard} />
        <Route path="/admin/sla" component={SlaBoard} />
        <Route path="/admin/barcodes" component={BarcodePrint} />
        <Route path="/admin/gst-export" component={GstExport} />
        <Route path="/admin/medivision" component={MedivisionSync} />
        <Route path="/admin/inventory">{() => <AdminInventory />}</Route>
        <Route path="/admin/inventory/current-stock">{() => <AdminCurrentStock />}</Route>
        <Route path="/admin/inventory/batchwise">{() => <AdminBatchwiseBalance />}</Route>
        <Route path="/admin/inventory/near-expiry">{() => <AdminNearExpiry />}</Route>
        <Route path="/admin/inventory/movements">{() => <AdminStockMovements />}</Route>
        <Route path="/admin/inventory/adjustments">{() => <AdminStockAdjustment />}</Route>
        <Route path="/admin/inventory/audit">{() => <AdminStockAudit />}</Route>
        <Route path="/admin/customers" component={AdminCustomers} />
        <Route path="/admin/riders" component={AdminRiders} />
        <Route path="/admin/whatsapp" component={AdminWhatsApp} />
        <Route path="/admin/refills" component={AdminRefills} />
        <Route path="/admin/accounting" component={AdminAccounting} />
        <Route path="/admin/utilities" component={AdminUtilities} />
        <Route path="/admin/settings" component={AdminSettings} />
        <Route path="/admin/masters" component={AdminMastersIndex} />
        <Route path="/admin/masters/suppliers" component={AdminSuppliers} />
        <Route path="/admin/masters/manufacturers" component={AdminManufacturers} />
        <Route path="/admin/masters/categories" component={AdminCategories} />
        <Route path="/admin/masters/generics" component={AdminGenerics} />
        <Route path="/admin/masters/schedules" component={AdminSchedules} />
        <Route path="/admin/masters/discount-categories" component={AdminDiscountCategories} />
        <Route path="/admin/masters/doctors" component={AdminDoctors} />
        <Route path="/admin/masters/patient-categories" component={AdminPatientCategories} />
        <Route path="/admin/masters/staff" component={AdminStaff} />
        <Route path="/admin/masters/stores" component={AdminStores} />
        <Route path="/admin/masters/buildings" component={AdminBuildings} />
        <Route path="/admin/masters/printers" component={AdminPrinters} />
        <Route path="/admin/masters/products" component={AdminProducts} />
        <Route path="/admin/sales" component={CounterSale} />
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
