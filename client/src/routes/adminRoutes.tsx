import type { ComponentType, ReactNode } from "react";
import { Route } from "wouter";
import { ADMIN_ROLES } from "./roleGuards";
import ExpiryDashboard from "@/pages/ExpiryDashboard";
import BarcodePrint from "@/pages/BarcodePrint";
import GstExport from "@/pages/GstExport";
import SlaBoard from "@/pages/SlaBoard";
import MedivisionSync from "@/pages/MedivisionSync";
import MasterData from "@/pages/MasterData";
import ShiftClosing from "@/pages/ShiftClosing";
import AdminCommandCenter from "@/pages/admin/AdminCommandCenter";
import AdminOrders from "@/pages/AdminOrders";
import AdminPrescriptionGov from "@/pages/prescriptions/AdminPrescriptionGov";
import AdminCounterBilling from "@/pages/sales/AdminCounterBilling";
import AdminSales from "@/pages/sales/AdminSales";
import AdminReports from "@/pages/AdminReports";
import AdminInventory from "@/pages/AdminInventory";
import AdminCurrentStock from "@/pages/inventory/AdminCurrentStock";
import AdminBatchwiseBalance from "@/pages/inventory/AdminBatchwiseBalance";
import AdminNearExpiry from "@/pages/inventory/AdminNearExpiry";
import AdminStockMovements from "@/pages/inventory/AdminStockMovements";
import AdminStockAdjustment from "@/pages/inventory/AdminStockAdjustment";
import AdminStockAudit from "@/pages/inventory/AdminStockAudit";
import AdminCustomers from "@/pages/AdminCustomers";
import AdminCustomerMedicineRecords from "@/pages/customers/AdminCustomers";
import AdminRiders from "@/pages/AdminRiders";
import AdminDelivery from "@/pages/admin/AdminDelivery";
import AdminWhatsApp from "@/pages/admin/AdminWhatsApp";
import AdminRefills from "@/pages/AdminRefills";
import AdminAccounting from "@/pages/AdminAccounting";
import AdminUtilities from "@/pages/AdminUtilities";
import AdminSettings from "@/pages/AdminSettings";
import AdminMastersIndex from "@/pages/masters/AdminMastersIndex";
import AdminSuppliers from "@/pages/masters/AdminSuppliers";
import AdminManufacturers from "@/pages/masters/AdminManufacturers";
import AdminCategories from "@/pages/masters/AdminCategories";
import AdminGenerics from "@/pages/masters/AdminGenerics";
import AdminSchedules from "@/pages/masters/AdminSchedules";
import AdminDiscountCategories from "@/pages/masters/AdminDiscountCategories";
import AdminDoctors from "@/pages/masters/AdminDoctors";
import AdminPatientCategories from "@/pages/masters/AdminPatientCategories";
import AdminStaff from "@/pages/masters/AdminStaff";
import AdminStores from "@/pages/masters/AdminStores";
import AdminBuildings from "@/pages/masters/AdminBuildings";
import AdminPrinters from "@/pages/masters/AdminPrinters";
import AdminProducts from "@/pages/masters/AdminProducts";
import AdminPurchaseInvoices from "@/pages/purchase/AdminPurchaseInvoices";
import AdminPurchaseReturns from "@/pages/purchase/AdminPurchaseReturns";
import AdminSupplierPayments from "@/pages/purchase/AdminSupplierPayments";
import AdminPurchaseReports from "@/pages/purchase/AdminPurchaseReports";
import AdminOcr from "@/pages/ocr/AdminOcr";
import AdminRuntimeIncident from "@/pages/admin/AdminRuntimeIncident";
import AdminDeadLetters from "@/pages/admin/AdminDeadLetters";
import AdminProviderHealth from "@/pages/admin/AdminProviderHealth";
import AdminOnCall from "@/pages/admin/AdminOnCall";
import AdminDeploymentReadiness from "@/pages/admin/AdminDeploymentReadiness";
import AdminChaosLab from "@/pages/admin/AdminChaosLab";
import AdminRestoreDrills from "@/pages/admin/AdminRestoreDrills";
import AdminCommandLog from "@/pages/admin/AdminCommandLog";
import AdminOutboxDispatch from "@/pages/admin/AdminOutboxDispatch";
import AdminReservations from "@/pages/admin/AdminReservations";
import AdminAvailability from "@/pages/admin/AdminAvailability";
import AdminSecurity from "@/pages/admin/AdminSecurity";
import AdminIntelligence from "@/pages/admin/AdminIntelligence";
import AdminAiEvalLedger from "@/pages/admin/AdminAiEvalLedger";
import AdminDsrQueue from "@/pages/admin/AdminDsrQueue";
import AdminConsentRegistry from "@/pages/admin/AdminConsentRegistry";
import AdminFamilyConsent from "@/pages/admin/AdminFamilyConsent";

export type AdminRouteDefinition = {
  path: string;
  Component: ComponentType;
};

export const adminRoutes: AdminRouteDefinition[] = [
  { path: "/admin", Component: AdminCommandCenter },
  { path: "/admin/command-center", Component: AdminCommandCenter },
  { path: "/admin/runtime", Component: AdminRuntimeIncident },
  { path: "/admin/runtime/incident", Component: AdminRuntimeIncident },
  { path: "/admin/dead-letters", Component: AdminDeadLetters },
  { path: "/admin/provider-health", Component: AdminProviderHealth },
  { path: "/admin/on-call", Component: AdminOnCall },
  { path: "/admin/deployment-readiness", Component: AdminDeploymentReadiness },
  { path: "/admin/chaos-lab", Component: AdminChaosLab },
  { path: "/admin/restore-drills", Component: AdminRestoreDrills },
  { path: "/admin/command-log", Component: AdminCommandLog },
  { path: "/admin/outbox-dispatch", Component: AdminOutboxDispatch },
  { path: "/admin/reservations", Component: AdminReservations },
  { path: "/admin/availability", Component: AdminAvailability },
  { path: "/admin/security", Component: AdminSecurity },
  { path: "/admin/orders", Component: AdminOrders },
  { path: "/admin/prescriptions", Component: AdminPrescriptionGov },
  { path: "/admin/sales/counter", Component: AdminCounterBilling },
  { path: "/admin/reports", Component: AdminReports },
  { path: "/admin/reports/daily-sales", Component: AdminReports },
  { path: "/admin/reports/stock", Component: AdminReports },
  { path: "/admin/reports/expiry", Component: ExpiryDashboard },
  { path: "/admin/reports/purchase", Component: AdminReports },
  { path: "/admin/reports/h1", Component: AdminReports },
  { path: "/admin/reports/gst", Component: GstExport },
  { path: "/admin/reports/sla", Component: SlaBoard },
  { path: "/admin/purchase", Component: AdminPurchaseInvoices },
  { path: "/admin/purchase/invoices", Component: AdminPurchaseInvoices },
  { path: "/admin/purchase/returns", Component: AdminPurchaseReturns },
  { path: "/admin/purchase/payments", Component: AdminSupplierPayments },
  { path: "/admin/purchase/reports", Component: AdminPurchaseReports },
  { path: "/admin/ocr", Component: AdminOcr },
  { path: "/admin/master-data", Component: MasterData },
  { path: "/admin/shift", Component: ShiftClosing },
  { path: "/admin/expiry", Component: ExpiryDashboard },
  { path: "/admin/sla", Component: SlaBoard },
  { path: "/admin/barcodes", Component: BarcodePrint },
  { path: "/admin/gst-export", Component: GstExport },
  { path: "/admin/medivision", Component: MedivisionSync },
  { path: "/admin/imports/medivision", Component: MedivisionSync },
  { path: "/admin/inventory", Component: AdminInventory },
  { path: "/admin/inventory/current-stock", Component: AdminCurrentStock },
  { path: "/admin/inventory/batchwise", Component: AdminBatchwiseBalance },
  { path: "/admin/inventory/near-expiry", Component: AdminNearExpiry },
  { path: "/admin/inventory/movements", Component: AdminStockMovements },
  { path: "/admin/inventory/adjustments", Component: AdminStockAdjustment },
  { path: "/admin/inventory/audit", Component: AdminStockAudit },
  { path: "/admin/customers", Component: AdminCustomers },
  {
    path: "/admin/customers/medicine-records",
    Component: AdminCustomerMedicineRecords,
  },
  { path: "/admin/riders", Component: AdminRiders },
  { path: "/admin/delivery", Component: AdminDelivery },
  { path: "/admin/whatsapp", Component: AdminWhatsApp },
  { path: "/admin/refills", Component: AdminRefills },
  { path: "/admin/accounting", Component: AdminAccounting },
  { path: "/admin/accounting/shift", Component: ShiftClosing },
  { path: "/admin/accounting/gst-export", Component: GstExport },
  { path: "/admin/accounting/tally", Component: AdminAccounting },
  { path: "/admin/utilities", Component: AdminUtilities },
  { path: "/admin/settings", Component: AdminSettings },
  { path: "/admin/masters", Component: AdminMastersIndex },
  { path: "/admin/masters/suppliers", Component: AdminSuppliers },
  { path: "/admin/masters/manufacturers", Component: AdminManufacturers },
  { path: "/admin/masters/categories", Component: AdminCategories },
  { path: "/admin/masters/generics", Component: AdminGenerics },
  { path: "/admin/masters/schedules", Component: AdminSchedules },
  {
    path: "/admin/masters/discount-categories",
    Component: AdminDiscountCategories,
  },
  { path: "/admin/masters/discounts", Component: AdminDiscountCategories },
  { path: "/admin/masters/doctors", Component: AdminDoctors },
  {
    path: "/admin/masters/patient-categories",
    Component: AdminPatientCategories,
  },
  { path: "/admin/masters/customers", Component: AdminCustomers },
  { path: "/admin/masters/staff", Component: AdminStaff },
  { path: "/admin/masters/stores", Component: AdminStores },
  { path: "/admin/masters/buildings", Component: AdminBuildings },
  { path: "/admin/masters/printers", Component: AdminPrinters },
  { path: "/admin/masters/products", Component: AdminProducts },
  { path: "/admin/sales", Component: AdminSales },
  { path: "/admin/intelligence", Component: AdminIntelligence },
  { path: "/admin/ai-eval-ledger", Component: AdminAiEvalLedger },
  { path: "/admin/dsr-queue", Component: AdminDsrQueue },
  { path: "/admin/consent-registry", Component: AdminConsentRegistry },
  { path: "/admin/family-consent", Component: AdminFamilyConsent },
];

type RestrictedRouteComponent = ComponentType<{
  children: ReactNode;
  allow: Set<string>;
}>;

export function AdminRoutes({
  RestrictedRoute,
}: {
  RestrictedRoute: RestrictedRouteComponent;
}) {
  return (
    <>
      {adminRoutes.map(({ path, Component }) => (
        <Route key={path} path={path}>
          {() => (
            <RestrictedRoute allow={ADMIN_ROLES}>
              <Component />
            </RestrictedRoute>
          )}
        </Route>
      ))}
    </>
  );
}
