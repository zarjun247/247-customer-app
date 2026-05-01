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
const ADMIN_ROLES = new Set(["admin", "super_admin", "ops_admin"]);
const STAFF_ROLES = new Set([
  "admin", "super_admin", "ops_admin", "pharmacist", "store_manager", "purchase_manager",
  "accountant", "cashier", "salesman", "rider", "inventory_operator", "delivery_operator", "auditor",
]);

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

function RestrictedRoute({ children, allow }: { children: React.ReactNode; allow: Set<string> }) {
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

  if (authLoading || !isAuthenticated || !user || !allow.has(user.role)) return null;
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
        <Route path="/workbench">{() => <RestrictedRoute allow={STAFF_ROLES}><PharmacistWorkbench /></RestrictedRoute>}</Route>
        <Route path="/pharmacy-os">{() => <RestrictedRoute allow={STAFF_ROLES}><PharmacyOS /></RestrictedRoute>}</Route>
        <Route path="/dashboard">{() => <RestrictedRoute allow={ADMIN_ROLES}><FounderDashboard /></RestrictedRoute>}</Route>
        <Route path="/ingestion">{() => <ProtectedRoute><InvoiceIngestion /></ProtectedRoute>}</Route>
        <Route path="/helpdesk">{() => <ProtectedRoute><Helpdesk /></ProtectedRoute>}</Route>
        <Route path="/consent">{() => <ProtectedRoute><Consent /></ProtectedRoute>}</Route>
        <Route path="/doctor-consult">{() => <ProtectedRoute><DoctorConsult /></ProtectedRoute>}</Route>
        <Route path="/pharmacy/expiry">{() => <RestrictedRoute allow={STAFF_ROLES}><ExpiryDashboard /></RestrictedRoute>}</Route>
        <Route path="/pharmacy/barcodes">{() => <RestrictedRoute allow={STAFF_ROLES}><BarcodePrint /></RestrictedRoute>}</Route>
        <Route path="/pharmacy/gst-export">{() => <RestrictedRoute allow={STAFF_ROLES}><GstExport /></RestrictedRoute>}</Route>
        <Route path="/pharmacy/sla">{() => <RestrictedRoute allow={STAFF_ROLES}><SlaBoard /></RestrictedRoute>}</Route>
        <Route path="/pharmacy/medivision">{() => <RestrictedRoute allow={STAFF_ROLES}><MedivisionSync /></RestrictedRoute>}</Route>
        <Route path="/pharmacy/purchase">{() => <RestrictedRoute allow={STAFF_ROLES}><PurchaseEntry /></RestrictedRoute>}</Route>
        <Route path="/pharmacy/ocr">{() => <RestrictedRoute allow={STAFF_ROLES}><OcrIngestion /></RestrictedRoute>}</Route>
        <Route path="/pharmacy/reports">{() => <RestrictedRoute allow={STAFF_ROLES}><Reports /></RestrictedRoute>}</Route>
        <Route path="/pharmacy/master-data">{() => <RestrictedRoute allow={STAFF_ROLES}><MasterData /></RestrictedRoute>}</Route>
        <Route path="/pharmacy/shift">{() => <RestrictedRoute allow={STAFF_ROLES}><ShiftClosing /></RestrictedRoute>}</Route>
        {/* Admin area */}
        <Route path="/admin">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminCommandCenter /></RestrictedRoute>}</Route>
        <Route path="/admin/command-center">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminCommandCenter /></RestrictedRoute>}</Route>
        <Route path="/admin/orders">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminOrders /></RestrictedRoute>}</Route>
        <Route path="/admin/prescriptions">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminPrescriptionGov /></RestrictedRoute>}</Route>
        <Route path="/admin/sales/counter">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminCounterBilling /></RestrictedRoute>}</Route>
        <Route path="/admin/reports">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminReports /></RestrictedRoute>}</Route>
        <Route path="/admin/reports/daily-sales">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminReports /></RestrictedRoute>}</Route>
        <Route path="/admin/reports/stock">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminReports /></RestrictedRoute>}</Route>
        <Route path="/admin/reports/expiry">{() => <RestrictedRoute allow={ADMIN_ROLES}><ExpiryDashboard /></RestrictedRoute>}</Route>
        <Route path="/admin/reports/purchase">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminReports /></RestrictedRoute>}</Route>
        <Route path="/admin/reports/h1">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminReports /></RestrictedRoute>}</Route>
        <Route path="/admin/reports/gst">{() => <RestrictedRoute allow={ADMIN_ROLES}><GstExport /></RestrictedRoute>}</Route>
        <Route path="/admin/reports/sla">{() => <RestrictedRoute allow={ADMIN_ROLES}><SlaBoard /></RestrictedRoute>}</Route>
        <Route path="/admin/purchase">{() => <AdminPurchaseInvoices />}</Route>
        <Route path="/admin/purchase/invoices">{() => <AdminPurchaseInvoices />}</Route>
        <Route path="/admin/purchase/returns">{() => <AdminPurchaseReturns />}</Route>
        <Route path="/admin/purchase/payments">{() => <AdminSupplierPayments />}</Route>
        <Route path="/admin/purchase/reports">{() => <AdminPurchaseReports />}</Route>
        <Route path="/admin/ocr">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminOcr /></RestrictedRoute>}</Route>
        <Route path="/admin/master-data">{() => <RestrictedRoute allow={ADMIN_ROLES}><MasterData /></RestrictedRoute>}</Route>
        <Route path="/admin/shift">{() => <RestrictedRoute allow={ADMIN_ROLES}><ShiftClosing /></RestrictedRoute>}</Route>
        <Route path="/admin/expiry">{() => <RestrictedRoute allow={ADMIN_ROLES}><ExpiryDashboard /></RestrictedRoute>}</Route>
        <Route path="/admin/sla">{() => <RestrictedRoute allow={ADMIN_ROLES}><SlaBoard /></RestrictedRoute>}</Route>
        <Route path="/admin/barcodes">{() => <RestrictedRoute allow={ADMIN_ROLES}><BarcodePrint /></RestrictedRoute>}</Route>
        <Route path="/admin/gst-export">{() => <RestrictedRoute allow={ADMIN_ROLES}><GstExport /></RestrictedRoute>}</Route>
        <Route path="/admin/medivision">{() => <RestrictedRoute allow={ADMIN_ROLES}><MedivisionSync /></RestrictedRoute>}</Route>
        <Route path="/admin/imports/medivision">{() => <RestrictedRoute allow={ADMIN_ROLES}><MedivisionSync /></RestrictedRoute>}</Route>
        <Route path="/admin/inventory">{() => <AdminInventory />}</Route>
        <Route path="/admin/inventory/current-stock">{() => <AdminCurrentStock />}</Route>
        <Route path="/admin/inventory/batchwise">{() => <AdminBatchwiseBalance />}</Route>
        <Route path="/admin/inventory/near-expiry">{() => <AdminNearExpiry />}</Route>
        <Route path="/admin/inventory/movements">{() => <AdminStockMovements />}</Route>
        <Route path="/admin/inventory/adjustments">{() => <AdminStockAdjustment />}</Route>
        <Route path="/admin/inventory/audit">{() => <AdminStockAudit />}</Route>
        <Route path="/admin/customers">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminCustomers /></RestrictedRoute>}</Route>
        <Route path="/admin/customers/medicine-records">{() => <AdminCustomersNew />}</Route>
        <Route path="/admin/riders">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminRiders /></RestrictedRoute>}</Route>
        <Route path="/admin/delivery">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminDelivery /></RestrictedRoute>}</Route>
        <Route path="/admin/whatsapp">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminWhatsApp /></RestrictedRoute>}</Route>
        <Route path="/admin/refills">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminRefills /></RestrictedRoute>}</Route>
        <Route path="/admin/accounting">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminAccounting /></RestrictedRoute>}</Route>
        <Route path="/admin/accounting/shift">{() => <RestrictedRoute allow={ADMIN_ROLES}><ShiftClosing /></RestrictedRoute>}</Route>
        <Route path="/admin/accounting/gst-export">{() => <RestrictedRoute allow={ADMIN_ROLES}><GstExport /></RestrictedRoute>}</Route>
        <Route path="/admin/accounting/tally">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminAccounting /></RestrictedRoute>}</Route>
        <Route path="/admin/utilities">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminUtilities /></RestrictedRoute>}</Route>
        <Route path="/admin/settings">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminSettings /></RestrictedRoute>}</Route>
        <Route path="/admin/masters">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminMastersIndex /></RestrictedRoute>}</Route>
        <Route path="/admin/masters/suppliers">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminSuppliers /></RestrictedRoute>}</Route>
        <Route path="/admin/masters/manufacturers">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminManufacturers /></RestrictedRoute>}</Route>
        <Route path="/admin/masters/categories">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminCategories /></RestrictedRoute>}</Route>
        <Route path="/admin/masters/generics">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminGenerics /></RestrictedRoute>}</Route>
        <Route path="/admin/masters/schedules">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminSchedules /></RestrictedRoute>}</Route>
        <Route path="/admin/masters/discount-categories">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminDiscountCategories /></RestrictedRoute>}</Route>
        <Route path="/admin/masters/discounts">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminDiscountCategories /></RestrictedRoute>}</Route>
        <Route path="/admin/masters/doctors">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminDoctors /></RestrictedRoute>}</Route>
        <Route path="/admin/masters/patient-categories">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminPatientCategories /></RestrictedRoute>}</Route>
        <Route path="/admin/masters/customers">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminPatientCategories /></RestrictedRoute>}</Route>
        <Route path="/admin/masters/staff">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminStaff /></RestrictedRoute>}</Route>
        <Route path="/admin/masters/stores">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminStores /></RestrictedRoute>}</Route>
        <Route path="/admin/masters/buildings">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminBuildings /></RestrictedRoute>}</Route>
        <Route path="/admin/masters/printers">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminPrinters /></RestrictedRoute>}</Route>
        <Route path="/admin/masters/products">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminProducts /></RestrictedRoute>}</Route>
        <Route path="/admin/sales">{() => <RestrictedRoute allow={ADMIN_ROLES}><AdminSales /></RestrictedRoute>}</Route>
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
