import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const adminRoutesPath = path.join(
  repoRoot,
  "client/src/routes/adminRoutes.tsx"
);
const appPath = path.join(repoRoot, "client/src/App.tsx");
const commandCenterPath = path.join(
  repoRoot,
  "client/src/pages/admin/AdminCommandCenter.tsx"
);

function read(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

function routeBlock(source: string, routePath: string) {
  const escapedPath = routePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Single-line: { path: "...", Component: Name }
  const singleLine = new RegExp(
    `\\{ path: "${escapedPath}", Component: ([A-Za-z0-9_]+) \\}`
  );
  const singleMatch = source.match(singleLine);
  if (singleMatch) return singleMatch[1];
  // Multi-line: path: "...", \n  Component: Name,
  const multiLine = new RegExp(
    `path: "${escapedPath}"[^}]*Component: ([A-Za-z0-9_]+)`,
    "s"
  );
  return source.match(multiLine)?.[1];
}

describe("admin route cockpit guards", () => {
  it("keeps all configured /admin routes behind the shared RestrictedRoute wrapper", () => {
    const app = read(appPath);
    const adminRoutes = read(adminRoutesPath);

    expect(app).toContain("<AdminRoutes RestrictedRoute={RestrictedRoute} />");
    expect(adminRoutes).toContain("<RestrictedRoute allow={ADMIN_ROLES}>");

    const legacyDirectAdminRoutes = app
      .split("\n")
      .filter(line => line.includes('<Route path="/admin'));

    expect(legacyDirectAdminRoutes).toEqual([]);
  });

  it("preserves audited admin path coverage in the route config", () => {
    const adminRoutes = read(adminRoutesPath);
    const requiredPaths = [
      "/admin/purchase",
      "/admin/purchase/invoices",
      "/admin/purchase/returns",
      "/admin/purchase/payments",
      "/admin/purchase/reports",
      "/admin/inventory",
      "/admin/inventory/current-stock",
      "/admin/inventory/batchwise",
      "/admin/inventory/near-expiry",
      "/admin/inventory/movements",
      "/admin/inventory/adjustments",
      "/admin/inventory/audit",
      "/admin/masters/customers",
      "/admin/reports",
      "/admin/reports/daily-sales",
      "/admin/reports/stock",
      "/admin/reports/expiry",
      "/admin/reports/purchase",
      "/admin/reports/h1",
      "/admin/reports/gst",
      "/admin/reports/sla",
      "/admin/settings",
      "/admin/masters",
    ];

    for (const routePath of requiredPaths) {
      expect(adminRoutes).toContain(`path: "${routePath}"`);
    }
  });

  it("maps /admin/masters/customers to the customer page, not patient categories", () => {
    const adminRoutes = read(adminRoutesPath);

    expect(routeBlock(adminRoutes, "/admin/masters/customers")).toBe(
      "AdminCustomers"
    );
    expect(routeBlock(adminRoutes, "/admin/masters/patient-categories")).toBe(
      "AdminPatientCategories"
    );
  });

  it("keeps the admin cockpit component renderable and wired with safe fallback states", () => {
    const commandCenter = read(commandCenterPath);

    expect(commandCenter).toContain(
      "export default function AdminCommandCenter()"
    );
    expect(commandCenter).toContain("Risk Cockpit Foundation");
    expect(commandCenter).toContain("Stock Risk");
    expect(commandCenter).toContain("Near-expiry Risk");
    expect(commandCenter).toContain("Rx/H1 Review");
    expect(commandCenter).toContain("Payment/Refund Risk");
    expect(commandCenter).toContain("SLA Breach Risk");
    expect(commandCenter).toContain("Supplier Outstanding");
    expect(commandCenter).toContain("Provider Failures");
    expect(commandCenter).toContain("Command center snapshot unavailable.");
    expect(commandCenter).toContain("Not wired");
    expect(commandCenter).toContain("No synthetic metrics");
  });
});
