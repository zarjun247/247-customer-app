import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Camera, Upload, FileText, CheckCircle, Clock, XCircle, ArrowLeft, Eye } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const STATUS_CONFIG = {
  pending_ocr: { label: "Processing", icon: Clock, color: "bg-blue-500/15 text-blue-400 border-blue-500/25" },
  pending_pharmacist: { label: "Pharmacist Reviewing", icon: Clock, color: "bg-amber-500/15 text-amber-400 border-amber-500/25" },
  approved: { label: "Approved", icon: CheckCircle, color: "bg-primary/15 text-primary border-primary/25" },
  rejected: { label: "Rejected", icon: XCircle, color: "bg-destructive/15 text-destructive border-destructive/25" },
};

export default function RxUpload() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: prescriptions, refetch } = trpc.prescriptions.list.useQuery(undefined, { enabled: isAuthenticated });

  const uploadRx = trpc.prescriptions.upload.useMutation({
    onSuccess: () => {
      toast.success("Prescription uploaded. Pharmacist will review shortly.");
      setPreview(null);
      refetch();
    },
    onError: (e) => {
      setUploading(false);
      toast.error(e.message);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("File too large. Maximum 5MB."); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleUpload = () => {
    if (!preview) return;
    setUploading(true);
    const base64 = preview.split(",")[1];
    const mimeType = preview.split(";")[0].split(":")[1];
    uploadRx.mutate({ imageBase64: base64, mimeType });
  };

  return (
    <AppLayout>
      <div className="px-4 pt-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate("/catalog")} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Prescriptions</h1>
            <p className="text-xs text-muted-foreground">Upload and track your Rx</p>
          </div>
        </div>

        {/* Upload Area */}
        <div className="mb-6">
          {preview ? (
            <div className="space-y-3">
              <div className="relative rounded-xl overflow-hidden border border-border">
                <img src={preview} alt="Prescription preview" className="w-full max-h-64 object-contain bg-card" />
                <button
                  onClick={() => setPreview(null)}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-background/80 flex items-center justify-center text-muted-foreground hover:text-foreground"
                >
                  <XCircle className="h-4 w-4" />
                </button>
              </div>
              <Button
                className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
                onClick={handleUpload}
                disabled={uploading || uploadRx.isPending}
              >
                {uploading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Uploading...
                  </span>
                ) : "Submit Prescription"}
              </Button>
            </div>
          ) : (
            <div
              className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="w-12 h-12 rounded-2xl bg-card flex items-center justify-center mx-auto mb-4">
                <Camera className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">Upload prescription</p>
              <p className="text-xs text-muted-foreground">Tap to take a photo or choose from gallery</p>
              <p className="text-xs text-muted-foreground mt-1">JPG, PNG up to 5MB</p>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </div>

        {/* Prescription History */}
        {prescriptions && prescriptions.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3">Your Prescriptions</h2>
            <div className="space-y-2">
              {prescriptions.map((rx) => {
                const config = STATUS_CONFIG[rx.status];
                const Icon = config.icon;
                return (
                  <div key={rx.id} className="flex items-center gap-3 p-3.5 rounded-xl bg-card border border-border">
                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">Prescription #{rx.id}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(rx.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>
                    <Badge className={`text-[10px] px-2 py-0.5 border ${config.color} flex items-center gap-1`}>
                      <Icon className="h-3 w-3" />
                      {config.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Info */}
        <div className="mt-6 px-4 py-4 rounded-xl bg-card border border-border">
          <p className="text-xs text-muted-foreground leading-relaxed">
            All prescriptions are reviewed by a licensed pharmacist. No medicine requiring a prescription will be dispensed without pharmacist approval. Your prescription is stored securely and used only for this order.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
