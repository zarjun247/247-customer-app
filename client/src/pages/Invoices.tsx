import AppLayout from "@/components/AppLayout";
import { FileText } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";

export default function Invoices() {
  const [, navigate] = useLocation();
  return (
    <AppLayout>
      <div className="px-4 pt-4 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-16 h-16 rounded-2xl bg-card flex items-center justify-center mb-4">
          <FileText className="h-8 w-8 text-muted-foreground opacity-40" />
        </div>
        <p className="text-foreground font-medium mb-1">Invoices</p>
        <p className="text-sm text-muted-foreground mb-6 max-w-xs">
          PDF invoices are available on each delivered order. View your orders to download invoices.
        </p>
        <Button variant="outline" className="border-border text-foreground hover:bg-secondary" onClick={() => navigate("/orders")}>
          View Orders
        </Button>
      </div>
    </AppLayout>
  );
}
