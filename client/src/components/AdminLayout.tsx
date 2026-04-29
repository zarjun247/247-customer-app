import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Package, Users, ShoppingCart, ClipboardList,
  FileText, BarChart3, Settings, LogOut, Menu, X,
  Stethoscope, Truck, Building2, Tag, Pill, FlaskConical, UserCog,
  Warehouse, Receipt, ScanLine, AlertTriangle, Clock, Database,
  Printer, Lock, Activity, TrendingUp, BookOpen,
  CreditCard, Wrench, ShieldCheck, Boxes, MessageSquare,
  Bike, RefreshCw, ChevronDown, ChevronRight, Home,
  DollarSign, Archive, Layers,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
  collapsible?: boolean;
}

const NAV_GROUPS: NavGroup[] = [
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
      { label: "Riders & Delivery", href: "/admin/riders", icon: Bike },
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
      { label: "Counter Billing", href: "/admin/sales/counter", icon: CreditCard },
      { label: "Sale Returns", href: "/admin/sales/returns", icon: RefreshCw },
    ],
  },
  {
    title: "Inventory",
    items: [
      { label: "Stock Overview", href: "/admin/inventory", icon: Warehouse },
      { label: "Expiry Board", href: "/admin/inventory/expiry", icon: AlertTriangle },
      { label: "Barcodes & Labels", href: "/admin/inventory/barcodes", icon: Printer },
      { label: "Adjustments", href: "/admin/inventory/adjustments", icon: Archive },
    ],
  },
  {
    title: "Customers & Patients",
    items: [
      { label: "Customers", href: "/admin/customers", icon: Users },
      { label: "Refill Reminders", href: "/admin/refills", icon: RefreshCw },
      { label: "WhatsApp", href: "/admin/whatsapp", icon: MessageSquare },
    ],
  },
  {
    title: "Master Data",
    collapsible: true,
    items: [
      { label: "Products", href: "/admin/masters/products", icon: Pill },
      { label: "Suppliers", href: "/admin/masters/suppliers", icon: Truck },
      { label: "Manufacturers", href: "/admin/masters/manufacturers", icon: Building2 },
      { label: "Categories", href: "/admin/masters/categories", icon: Tag },
      { label: "Generics / Salts", href: "/admin/masters/generics", icon: FlaskConical },
      { label: "Schedules", href: "/admin/masters/schedules", icon: ShieldCheck },
      { label: "Discounts", href: "/admin/masters/discount-categories", icon: Tag },
      { label: "Doctors", href: "/admin/masters/doctors", icon: Stethoscope },
      { label: "Staff", href: "/admin/masters/staff", icon: UserCog },
      { label: "Buildings", href: "/admin/masters/buildings", icon: Building2 },
      { label: "Stores", href: "/admin/masters/stores", icon: Boxes },
    ],
  },
  {
    title: "Reports",
    collapsible: true,
    items: [
      { label: "Daily Sales", href: "/admin/reports/daily-sales", icon: BarChart3 },
      { label: "Stock Report", href: "/admin/reports/stock", icon: Package },
      { label: "Expiry Report", href: "/admin/reports/expiry", icon: AlertTriangle },
      { label: "Purchase Register", href: "/admin/reports/purchase", icon: FileText },
      { label: "H1 Register", href: "/admin/reports/h1", icon: BookOpen },
      { label: "GST Summary", href: "/admin/reports/gst", icon: Receipt },
      { label: "SLA Performance", href: "/admin/reports/sla", icon: Clock },
    ],
  },
  {
    title: "Accounting",
    collapsible: true,
    items: [
      { label: "Ledger", href: "/admin/accounting", icon: DollarSign },
      { label: "Shift Closing", href: "/admin/accounting/shift", icon: Lock },
      { label: "GST Export", href: "/admin/accounting/gst-export", icon: FileText },
      { label: "Tally Export", href: "/admin/accounting/tally", icon: Layers },
    ],
  },
  {
    title: "Imports",
    items: [
      { label: "Medivision Sync", href: "/admin/imports/medivision", icon: Database },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Utilities", href: "/admin/utilities", icon: Wrench },
      { label: "Settings", href: "/admin/settings", icon: Settings },
    ],
  },
];

// All roles that can access the admin area
const ADMIN_AREA_ROLES = [
  "admin", "super_admin", "ops_admin",
  "pharmacist", "store_manager",
  "purchase_manager", "accountant",
  "cashier", "salesman",
  "rider", "inventory_operator", "delivery_operator", "auditor",
];

function NavLink({ item }: { item: NavItem }) {
  const [location] = useLocation();
  const isActive =
    location === item.href ||
    (item.href !== "/admin" && item.href !== "/dashboard" && location.startsWith(item.href + "/"));
  const Icon = item.icon;
  return (
    <Link href={item.href}>
      <div
        className={cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all cursor-pointer",
          isActive
            ? "bg-blue-600/20 text-blue-400 border border-blue-600/30"
            : "text-zinc-400 hover:text-zinc-100 hover:bg-white/5",
        )}
      >
        <Icon className="w-4 h-4 shrink-0" />
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

function NavGroupSection({ group }: { group: NavGroup }) {
  const [location] = useLocation();
  const isAnyActive = group.items.some(
    item => location === item.href || location.startsWith(item.href + "/"),
  );
  const [open, setOpen] = useState(!group.collapsible || isAnyActive);

  return (
    <div className="mb-1">
      <button
        onClick={() => group.collapsible && setOpen(o => !o)}
        className={cn(
          "w-full flex items-center justify-between px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500",
          group.collapsible ? "cursor-pointer hover:text-zinc-300" : "cursor-default",
        )}
      >
        <span>{group.title}</span>
        {group.collapsible && (
          open
            ? <ChevronDown className="w-3 h-3" />
            : <ChevronRight className="w-3 h-3" />
        )}
      </button>
      {open && (
        <div className="space-y-0.5 mt-0.5">
          {group.items.map(item => <NavLink key={item.href} item={item} />)}
        </div>
      )}
    </div>
  );
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [location] = useLocation();

  const isStaff = user && ADMIN_AREA_ROLES.includes(user.role ?? "");

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <ShieldCheck className="w-12 h-12 text-zinc-600 mx-auto" />
          <p className="text-zinc-400">Please log in to access the admin area.</p>
          <Link href="/"><Button variant="outline">Go to App</Button></Link>
        </div>
      </div>
    );
  }

  if (!isStaff) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Lock className="w-12 h-12 text-red-500/50 mx-auto" />
          <p className="text-zinc-300 font-medium">Access Restricted</p>
          <p className="text-zinc-500 text-sm">Your account does not have staff access to this area.</p>
          <Link href="/"><Button variant="outline">Go to App</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col bg-zinc-900 border-r border-white/5 transition-all duration-200 shrink-0",
          sidebarOpen ? "w-60" : "w-14",
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-4 border-b border-white/5 shrink-0">
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-white/5 transition-colors shrink-0"
          >
            {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
          {sidebarOpen && (
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center shrink-0">
                <Activity className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-sm font-semibold text-zinc-100 truncate">Pharmacy OS</span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-3">
          {sidebarOpen ? (
            NAV_GROUPS.map(group => (
              <NavGroupSection key={group.title} group={group} />
            ))
          ) : (
            // Collapsed: icons only
            NAV_GROUPS.flatMap(g => g.items).map(item => {
              const Icon = item.icon;
              const isActive = location === item.href || location.startsWith(item.href + "/");
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={cn(
                      "flex items-center justify-center p-2 rounded-lg transition-colors cursor-pointer",
                      isActive ? "bg-blue-600/20 text-blue-400" : "text-zinc-500 hover:text-zinc-100 hover:bg-white/5",
                    )}
                    title={item.label}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                </Link>
              );
            })
          )}
        </nav>

        {/* Footer */}
        <div className="border-t border-white/5 p-3 shrink-0">
          {sidebarOpen ? (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center shrink-0">
                <span className="text-xs font-medium text-zinc-300">
                  {(user.name ?? user.email ?? "?")[0].toUpperCase()}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-zinc-200 truncate">{user.name ?? user.email}</p>
                <p className="text-[10px] text-zinc-500 capitalize">{user.role ?? "staff"}</p>
              </div>
              <div className="flex gap-1">
                <Link href="/">
                  <button className="p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-colors" title="Customer App">
                    <Home className="w-3.5 h-3.5" />
                  </button>
                </Link>
                <button
                  onClick={() => logout()}
                  className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Log out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Link href="/">
                <button className="p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-colors" title="Customer App">
                  <Home className="w-3.5 h-3.5" />
                </button>
              </Link>
              <button
                onClick={() => logout()}
                className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Log out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
