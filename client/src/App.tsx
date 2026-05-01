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
import AdminOcr from "./pages/ocr/AdminOcr";
import Reports from "./pages/Reports";
import MasterData from "./pages/MasterData";
import ShiftClosing from "./pages/ShiftClosing";
import AdminCommandCenter from "./pages/admin/AdminCommandCenter";
import AdminOrders from "./pages/AdminOrders";
import AdminPrescriptionGov from "./pages/prescriptions/AdminPrescriptionGov";
import AdminCounterBilling from "./pages/sales/AdminCounterBilling";
import AdminSales from "./pages/sales/AdminSales";
import AdminReports from "./pages/AdminReports";
import AdminInventory from "./pages/AdminInventory";
import AdminCurrentStock from "./pages/inventory/AdminCurrentStock";
import AdminBatchwiseBalance from "./pages/inventory/AdminBatchwiseBalance";
import AdminNearExpiry from "./pages/inventory/AdminNearExpiry";
import AdminStockMovements from "./pages/inventory/AdminStockMovements";
import AdminStockAdjustment from "./pages/inventory/AdminStockAdjustment";
import AdminStockAudit from "./pages/inventory/AdminStockAudit";
import AdminCustomers from "./pages/AdminCustomers";
import AdminCustomersNew from "./pages/customers/AdminCustomers";
import FamilyProfiles from "./pages/FamilyProfiles";
import RefillCalendar from "./pages/RefillCalendar";
import MyMedicines from "./pages/MyMedicines";
import AdminRiders from "./pages/AdminRiders";
import AdminDelivery from "./pages/admin/AdminDelivery";
import AdminWhatsApp from "./pages/admin/AdminWhatsApp";
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

function StaffRoute({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { isAuthenticated, user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      navigate(`/login?return=${encodeURIComponent(location)}`);
      return;
    }

    const role = user?.role;
    if (!role || role === "user" || role === "customer") {
      navigate("/");
    }
  }, [authLoading, isAuthenticated, location, navigate, user?.role]);

  if (authLoading || !isAuthenticated) return null;
  if (!user?.role || user.role === "user" || user.role === "customer") return null;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { isAuthenticated, user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      navigate(`/login?return=${encodeURIComponent(location)}`);
      return;
    }

    const role = user?.role;
    if (!role || role === "user" || role === "customer") {
      navigate("/");
    }
  }, [authLoading, isAuthenticated, location, navigate, user?.role]);

  if (authLoading || !isAuthenticated) return null;
  if (!user?.role || user.role === "user" || user.role === "customer") return null;
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
        <Route path="/family">{() => <ProtectedRoute><FamilyProfiles /></ProtectedRoute>}</Route>
        <Route path="/refill-calendar">{() => <ProtectedRoute><RefillCalendar /></ProtectedRoute>}</Route>
        <Route path="/my-medicines">{() => <ProtectedRoute><MyMedicines /></ProtectedRoute>}</Route>
        <Route path="/workbench">{() => <StaffRoute><PharmacistWorkbench /></StaffRoute>}</Route>
        <Route path="/pharmacy-os">{() => <StaffRoute><PharmacyOS /></StaffRoute>}</Route>
        <Route path="/dashboard">{() => <StaffRoute><FounderDashboard /></StaffRoute>}</Route>
        <Route path="/ingestion">{() => <ProtectedRoute><InvoiceIngestion /></ProtectedRoute>}</Route>
        <Route path="/helpdesk">{() => <ProtectedRoute><Helpdesk /></ProtectedRoute>}</Route>
        <Route path="/consent">{() => <ProtectedRoute><Consent /></ProtectedRoute>}</Route>
        <Route path="/doctor-consult">{() => <ProtectedRoute><DoctorConsult /></ProtectedRoute>}</Route>
        <Route path="/pharmacy/expiry">{() => <StaffRoute><ExpiryDashboard /></StaffRoute>}</Route>
        <Route path="/pharmacy/barcodes">{() => <StaffRoute><BarcodePrint /></StaffRoute>}</Route>
        <Route path="/pharmacy/gst-export">{() => <StaffRoute><GstExport /></StaffRoute>}</Route>
        <Route path="/pharmacy/sla">{() => <StaffRoute><SlaBoard /></StaffRoute>}</Route>
        <Route path="/pharmacy/medivision">{() => <StaffRoute><MedivisionSync /></StaffRoute>}</Route>
        <Route path="/pharmacy/purchase">{() => <StaffRoute><PurchaseEntry /></StaffRoute>}</Route>
        <Route path="/pharmacy/ocr">{() => <StaffRoute><OcrIngestion /></StaffRoute>}</Route>
        <Route path="/pharmacy/reports">{() => <StaffRoute><Reports /></StaffRoute>}</Route>
        <Route path="/pharmacy/master-data">{() => <StaffRoute><MasterData /></StaffRoute>}</Route>
        <Route path="/pharmacy/shift">{() => <StaffRoute><ShiftClosing /></StaffRoute>}</Route>
        {/* Admin area */}
        <Route path="/admin">{() => <AdminRoute><AdminCommandCenter /></AdminRoute>}</Route>
        <Route path="/admin/command-center">{() => <AdminRoute><AdminCommandCenter /></AdminRoute>}</Route>
        <Route path="/admin/orders">{() => <AdminRoute><AdminOrders /></AdminRoute>}</Route>
        <Route path="/admin/prescriptions">{() => <AdminRoute><AdminPrescriptionGov /></AdminRoute>}</Route>
        <Route path="/admin/sales/counter">{() => <AdminRoute><AdminCounterBilling /></AdminRoute>}</Route>
        <Route path="/admin/reports">{() => <AdminRoute><AdminReports /></AdminRoute>}</Route>
        <Route path="/admin/reports/daily-sales">{() => <AdminRoute><AdminReports /></AdminRoute>}</Route>
        <Route path="/admin/reports/stock">{() => <AdminRoute><AdminReports /></AdminRoute>}</Route>
        <Route path="/admin/reports/expiry">{() => <AdminRoute><ExpiryDashboard /></AdminRoute>}</Route>
        <Route path="/admin/reports/purchase">{() => <AdminRoute><AdminReports /></AdminRoute>}</Route>
        <Route path="/admin/reports/h1">{() => <AdminRoute><AdminReports /></AdminRoute>}</Route>
        <Route path="/admin/reports/gst">{() => <AdminRoute><GstExport /></AdminRoute>}</Route>
        <Route path="/admin/reports/sla">{() => <AdminRoute><SlaBoard /></AdminRoute>}</Route>
        <Route path="/admin/purchase">{() => <AdminRoute><AdminPurchaseInvoices /></AdminRoute>}</Route>
        <Route path="/admin/purchase/invoices">{() => <AdminRoute><AdminPurchaseInvoices /></AdminRoute>}</Route>
        <Route path="/admin/purchase/returns">{() => <AdminRoute><AdminPurchaseReturns /></AdminRoute>}</Route>
        <Route path="/admin/purchase/payments">{() => <AdminRoute><AdminSupplierPayments /></AdminRoute>}</Route>
        <Route path="/admin/purchase/reports">{() => <AdminRoute><AdminPurchaseReports /></AdminRoute>}</Route>
        <Route path="/admin/ocr">{() => <AdminRoute><AdminOcr /></AdminRoute>}</Route>
        <Route path="/admin/master-data">{() => <AdminRoute><MasterData /></AdminRoute>}</Route>
        <Route path="/admin/shift">{() => <AdminRoute><ShiftClosing /></AdminRoute>}</Route>
        <Route path="/admin/expiry">{() => <AdminRoute><ExpiryDashboard /></AdminRoute>}</Route>
        <Route path="/admin/sla">{() => <AdminRoute><SlaBoard /></AdminRoute>}</Route>
        <Route path="/admin/barcodes">{() => <AdminRoute><BarcodePrint /></AdminRoute>}</Route>
        <Route path="/admin/gst-export">{() => <AdminRoute><GstExport /></AdminRoute>}</Route>
        <Route path="/admin/medivision">{() => <AdminRoute><MedivisionSync /></AdminRoute>}</Route>
        <Route path="/admin/imports/medivision">{() => <AdminRoute><MedivisionSync /></AdminRoute>}</Route>
        <Route path="/admin/inventory">{() => <AdminRoute><AdminInventory /></AdminRoute>}</Route>
        <Route path="/admin/inventory/current-stock">{() => <AdminRoute><AdminCurrentStock /></AdminRoute>}</Route>
        <Route path="/admin/inventory/batchwise">{() => <AdminRoute><AdminBatchwiseBalance /></AdminRoute>}</Route>
        <Route path="/admin/inventory/near-expiry">{() => <AdminRoute><AdminNearExpiry /></AdminRoute>}</Route>
        <Route path="/admin/inventory/movements">{() => <AdminRoute><AdminStockMovements /></AdminRoute>}</Route>
        <Route path="/admin/inventory/adjustments">{() => <AdminRoute><AdminStockAdjustment /></AdminRoute>}</Route>
        <Route path="/admin/inventory/audit">{() => <AdminRoute><AdminStockAudit /></AdminRoute>}</Route>
        <Route path="/admin/customers">{() => <AdminRoute><AdminCustomers /></AdminRoute>}</Route>
        <Route path="/admin/customers/medicine-records">{() => <AdminRoute><AdminCustomersNew /></AdminRoute>}</Route>
        <Route path="/admin/riders">{() => <AdminRoute><AdminRiders /></AdminRoute>}</Route>
        <Route path="/admin/delivery">{() => <AdminRoute><AdminDelivery /></AdminRoute>}</Route>
        <Route path="/admin/whatsapp">{() => <AdminRoute><AdminWhatsApp /></AdminRoute>}</Route>
        <Route path="/admin/refills">{() => <AdminRoute><AdminRefills /></AdminRoute>}</Route>
        <Route path="/admin/accounting">{() => <AdminRoute><AdminAccounting /></AdminRoute>}</Route>
        <Route path="/admin/accounting/shift">{() => <AdminRoute><ShiftClosing /></AdminRoute>}</Route>
        <Route path="/admin/accounting/gst-export">{() => <AdminRoute><GstExport /></AdminRoute>}</Route>
        <Route path="/admin/accounting/tally">{() => <AdminRoute><AdminAccounting /></AdminRoute>}</Route>
        <Route path="/admin/utilities">{() => <AdminRoute><AdminUtilities /></AdminRoute>}</Route>
        <Route path="/admin/settings">{() => <AdminRoute><AdminSettings /></AdminRoute>}</Route>
        <Route path="/admin/masters">{() => <AdminRoute><AdminMastersIndex /></AdminRoute>}</Route>
        <Route path="/admin/masters/suppliers">{() => <AdminRoute><AdminSuppliers /></AdminRoute>}</Route>
        <Route path="/admin/masters/manufacturers">{() => <AdminRoute><AdminManufacturers /></AdminRoute>}</Route>
        <Route path="/admin/masters/categories">{() => <AdminRoute><AdminCategories /></AdminRoute>}</Route>
        <Route path="/admin/masters/generics">{() => <AdminRoute><AdminGenerics /></AdminRoute>}</Route>
        <Route path="/admin/masters/schedules">{() => <AdminRoute><AdminSchedules /></AdminRoute>}</Route>
        <Route path="/admin/masters/discount-categories">{() => <AdminRoute><AdminDiscountCategories /></AdminRoute>}</Route>
        <Route path="/admin/masters/discounts">{() => <AdminRoute><AdminDiscountCategories /></AdminRoute>}</Route>
        <Route path="/admin/masters/doctors">{() => <AdminRoute><AdminDoctors /></AdminRoute>}</Route>
        <Route path="/admin/masters/patient-categories">{() => <AdminRoute><AdminPatientCategories /></AdminRoute>}</Route>
        <Route path="/admin/masters/customers">{() => <AdminRoute><AdminCustomers /></AdminRoute>}</Route>
        <Route path="/admin/masters/staff">{() => <AdminRoute><AdminStaff /></AdminRoute>}</Route>
        <Route path="/admin/masters/stores">{() => <AdminRoute><AdminStores /></AdminRoute>}</Route>
        <Route path="/admin/masters/buildings">{() => <AdminRoute><AdminBuildings /></AdminRoute>}</Route>
        <Route path="/admin/masters/printers">{() => <AdminRoute><AdminPrinters /></AdminRoute>}</Route>
        <Route path="/admin/masters/products">{() => <AdminRoute><AdminProducts /></AdminRoute>}</Route>
        <Route path="/admin/sales">{() => <AdminRoute><AdminSales /></AdminRoute>}</Route>
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
