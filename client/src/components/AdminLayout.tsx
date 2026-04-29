import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Package, Users, ShoppingCart, ClipboardList,
  FileText, BarChart3, Settings, ChevronRight, LogOut, Menu, X,
  Stethoscope, Truck, Building2, Tag, Pill, FlaskConical, UserCog,
  Warehouse, Receipt, ScanLine, AlertTriangle, Clock, Database,
  Printer, Lock, ArrowLeftRight, Activity, TrendingUp, BookOpen,
  CreditCard, Wrench, ShieldCheck, Boxes,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  children?: NavItem[];
}

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Overview",
    items: [
      { label: "Command Center", href: "/admin/command-center", icon: LayoutDashboard },
      { label: "Founder Dashboard", href: "/dashboard", icon: TrendingUp },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Orders", href: "/admin/orders", icon: ShoppingCart },
      { label: "Prescriptions", href: "/admin/prescriptions", icon: ClipboardList },
      { label: "Inventory", href: "/admin/inventory", icon: Warehouse },
    ],
  },
  {
    title: "Purchase",
    items: [
      { label: "Purchase Entry", href: "/admin/purchase", icon: Receipt },
      { label: "OCR Ingestion", href: "/admin/ocr", icon: ScanLine },
    ],
  },
  {
    title: "Sales",
    items: [
      { label: "Counter Sale", href: "/admin/sales/counter", icon: CreditCard },
    ],
  },
  {
    title: "Master Data",
    items: [
      { label: "Products", href: "/admin/masters/products", icon: Pill },
      { label: "Suppliers", href: "/admin/masters/suppliers", icon: Truck },
      { label: "Manufacturers", href: "/admin/masters/manufacturers", icon: Building2 },
      { label: "Categories", href: "/admin/masters/categories", icon: Tag },
      { label: "Generics / Salts", href: "/admin/masters/generics", icon: FlaskConical },
      { label: "Schedules", href: "/admin/masters/schedules", icon: ShieldCheck },
      { label: "Discounts", href: "/admin/masters/discounts", icon: Tag },
      { label: "Doctors", href: "/admin/masters/doctors", icon: Stethoscope },
      { label: "Customers", href: "/admin/masters/customers", icon: Users },
      { label: "Staff", href: "/admin/masters/staff", icon: UserCog },
      { label: "Buildings", href: "/admin/masters/buildings", icon: Building2 },
      { label: "Stores", href: "/admin/masters/stores", icon: Boxes },
    ],
  },
  {
    title: "Reports",
    items: [
      { label: "Daily Sales", href: "/admin/reports/daily-sales", icon: BarChart3 },
      { label: "Stock Report", href: "/admin/reports/stock", icon: Package },
      { label: "Expiry Report", href: "/admin/reports/expiry", icon: AlertTriangle },
      { label: "Purchase Register", href: "/admin/reports/purchase", icon: FileText },
      { label: "H1 Register", href: "/admin/reports/h1", icon: BookOpen },
      { label: "GST Summary", href: "/admin/reports/gst", icon: Receipt },
      { label: "SLA Performance", href: "/pharmacy/sla", icon: Clock },
    ],
  },
  {
    title: "Finance",
    items: [
      { label: "Accounting", href: "/admin/accounting", icon: CreditCard },
      { label: "GST Export", href: "/pharmacy/gst-export", icon: FileText },
      { label: "Shift Closing", href: "/pharmacy/shift", icon: Lock },
    ],
  },
  {
    title: "Utilities",
    items: [
      { label: "Barcode Print", href: "/pharmacy/barcodes", icon: Printer },
      { label: "Medivision Sync", href: "/pharmacy/medivision", icon: Database },
      { label: "Utilities", href: "/admin/utilities", icon: Wrench },
    ],
  },
];

function NavLink({ item, depth = 0 }: { item: NavItem; depth?: number }) {
  const [location] = useLocation();
  const isActive = location === item.href || location.startsWith(item.href + "/");
  const Icon = item.icon;

  return (
    <Link href={item.href}>
      <div
        className={cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all cursor-pointer group",
          depth > 0 && "ml-4 text-xs",
          isActive
            ? "bg-blue-600/20 text-blue-400 border border-blue-600/30"
            : "text-zinc-400 hover:text-zinc-100 hover:bg-white/5",
        )}
      >
        <Icon className={cn("shrink-0", depth > 0 ? "w-3.5 h-3.5" : "w-4 h-4")} />
        <span className="flex-1 truncate">{item.label}</span>
        {item.badge && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-red-500/20 text-red-400 border-0">
            {item.badge}
          </Badge>
        )}
      </div>
    </Link>
  );
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [location] = useLocation();

  // Redirect non-staff users
  const staffRoles = ["admin", "super_admin", "pharmacist", "store_manager", "purchase_manager",
    "accountant", "cashier", "salesman", "rider", "ops_admin", "inventory_operator",
    "delivery_operator", "auditor"];
  const isStaff = user && staffRoles.includes(user.role ?? "");

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <ShieldCheck className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <p className="text-zinc-400 mb-4">Please log in to access the admin area.</p>
          <Link href="/"><Button variant="outline">Go to App</Button></Link>
        </div>
      </div>
    );
  }

  if (!isStaff) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <ShieldCheck className="w-12 h-12 text-red-500/50 mx-auto mb-4" />
          <p className="text-zinc-300 font-medium mb-2">Access Denied</p>
          <p className="text-zinc-500 text-sm mb-4">You do not have staff access to this area.</p>
          <Link href="/"><Button variant="outline">Go to App</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col bg-zinc-900 border-r border-white/5 transition-all duration-200 shrink-0",
          sidebarOpen ? "w-56" : "w-14",
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-4 border-b border-white/5">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-white/5 transition-colors shrink-0"
          >
            {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
          {sidebarOpen && (
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center shrink-0">
                <Activity className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-sm font-semibold text-zinc-100 truncate">24/7 Pharmacy OS</span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              {sidebarOpen && (
                <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider px-3 mb-1">
                  {group.title}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) =>
                  sidebarOpen ? (
                    <NavLink key={item.href} item={item} />
                  ) : (
                    <Link key={item.href} href={item.href}>
                      <div
                        className={cn(
                          "flex items-center justify-center p-2 rounded-lg transition-all cursor-pointer",
                          location === item.href
                            ? "bg-blue-600/20 text-blue-400"
                            : "text-zinc-500 hover:text-zinc-100 hover:bg-white/5",
                        )}
                        title={item.label}
                      >
                        <item.icon className="w-4 h-4" />
                      </div>
                    </Link>
                  )
                )}
              </div>
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-white/5 p-3">
          {sidebarOpen ? (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center shrink-0">
                <span className="text-xs font-medium text-zinc-300">
                  {(user.name ?? "?")[0]?.toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-zinc-200 truncate">{user.name ?? "Staff"}</p>
                <p className="text-[10px] text-zinc-500 truncate capitalize">{user.role ?? "user"}</p>
              </div>
              <button
                onClick={() => logout()}
                className="p-1 rounded text-zinc-500 hover:text-red-400 transition-colors"
                title="Logout"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => logout()}
              className="w-full flex items-center justify-center p-1.5 rounded text-zinc-500 hover:text-red-400 transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-auto">
        {children}
      </main>
    </div>
  );
}
