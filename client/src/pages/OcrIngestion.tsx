import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, Upload, FileText, CheckCircle, AlertCircle, Clock, Eye } from "lucide-react";
import { toast } from "sonner";

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  queued: { label: "Queued", color: "bg-white/10 text-white/60", icon: Clock },
  processing: { label: "Processing", color: "bg-blue-500/20 text-blue-400", icon: Clock },
  ocr_complete: { label: "OCR Done", color: "bg-amber-500/20 text-amber-400", icon: AlertCircle },
  under_review: { label: "Under Review", color: "bg-purple-500/20 text-purple-400", icon: Eye },
  committed: { label: "Committed", color: "bg-emerald-500/20 text-emerald-400", icon: CheckCircle },
  failed: { label: "Failed", color: "bg-red-500/20 text-red-400", icon: AlertCircle },
};

export default function OcrIngestion() {
  const [, setLocation] = useLocation();
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: jobs, refetch: refetchJobs } = trpc.ocr.listJobs.useQuery({ limit: 50 });
  const { data: jobDetail } = trpc.ocr.getJob.useQuery(
    { jobId: selectedJobId! },
    { enabled: !!selectedJobId, refetchInterval: (query) => query.state.data?.job.status === "processing" ? 3000 : false }
  );

  const reviewLine = trpc.ocr.reviewLine.useMutation({
    onSuccess: () => toast.success("Line updated"),
    onError: (e) => toast.error(e.message),
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) { toast.error("File must be under 16 MB"); return; }

    setUploading(true);
    setUploadProgress(20);

    try {
      // Upload to storage first
      const formData = new FormData();
      formData.append("file", file);
      setUploadProgress(50);

      // Use the storage upload endpoint
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const { url, key } = await uploadRes.json();
      setUploadProgress(80);

      // Trigger OCR
      const result = await fetch("/api/trpc/ocr.uploadBill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          json: {
            storeId: 1,
            fileUrl: url,
            fileKey: key,
            filename: file.name,
            mimeType: file.type,
          },
        }),
      });
      if (!result.ok) throw new Error("OCR trigger failed");
      const data = await result.json();
      setUploadProgress(100);
      toast.success(`OCR started — ${data.result.data.json.linesExtracted} lines extracted`);
      setSelectedJobId(data.result.data.json.jobId);
      refetchJobs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const confidenceColor = (c: string | null) => {
    const n = parseFloat(c ?? "0");
    if (n >= 95) return "text-emerald-400";
    if (n >= 70) return "text-amber-400";
    return "text-red-400";
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => selectedJobId ? setSelectedJobId(null) : setLocation("/pharmacy")} className="text-white/60 hover:text-white">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">AI Bill Ingestion</h1>
            <p className="text-sm text-white/50">Upload purchase bills — AI extracts line items automatically</p>
          </div>
        </div>

        {!selectedJobId ? (
          <>
            {/* Upload zone */}
            <Card className="bg-white/5 border-white/10 border-dashed mb-6 cursor-pointer hover:bg-white/8 transition-colors" onClick={() => fileRef.current?.click()}>
              <CardContent className="py-12 text-center">
                {uploading ? (
                  <div className="space-y-3">
                    <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center mx-auto">
                      <Clock className="w-5 h-5 text-blue-400 animate-spin" />
                    </div>
                    <p className="text-white/70">Processing bill...</p>
                    <Progress value={uploadProgress} className="max-w-xs mx-auto h-1.5" />
                  </div>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-3">
                      <Upload className="w-6 h-6 text-blue-400" />
                    </div>
                    <p className="text-white font-medium">Upload Purchase Bill</p>
                    <p className="text-sm text-white/50 mt-1">JPG, PNG, or PDF · max 16 MB</p>
                    <p className="text-xs text-white/30 mt-2">AI will extract supplier, invoice number, and all line items</p>
                  </>
                )}
              </CardContent>
            </Card>
            <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileUpload} />

            {/* Jobs list */}
            <div className="space-y-3">
              {jobs?.rows?.map((job) => {
                const cfg = statusConfig[job.status] ?? statusConfig.queued;
                const Icon = cfg.icon;
                return (
                  <Card key={job.id} className="bg-white/5 border-white/10 cursor-pointer hover:bg-white/8 transition-colors" onClick={() => setSelectedJobId(job.id)}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center">
                          <FileText className="w-4 h-4 text-white/60" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{job.filename ?? "Bill"}</p>
                          <p className="text-xs text-white/50">{new Date(job.createdAt).toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {job.ocrConfidence && <span className={`text-xs font-mono ${confidenceColor(job.ocrConfidence)}`}>{job.ocrConfidence}% conf</span>}
                        <Badge className={`${cfg.color} border-0 gap-1 text-xs`}>
                          <Icon className="w-3 h-3" /> {cfg.label}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {(!jobs?.rows || jobs.rows.length === 0) && (
                <div className="text-center py-16 text-white/40">
                  <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p>No bills uploaded yet</p>
                </div>
              )}
            </div>
          </>
        ) : (
          jobDetail && (
            <div className="space-y-4">
              <Card className="bg-white/5 border-white/10">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{jobDetail.job.filename}</p>
                    <p className="text-sm text-white/50">
                      {jobDetail.headers?.[0]?.supplierName ?? "Supplier extracting..."} ·
                      Invoice: {jobDetail.headers?.[0]?.invoiceNo ?? "—"} ·
                      Date: {jobDetail.headers?.[0]?.invoiceDate ?? "—"}
                    </p>
                  </div>
                  <Badge className={`${(statusConfig[jobDetail.job.status] ?? statusConfig.queued).color} border-0`}>
                    {(statusConfig[jobDetail.job.status] ?? statusConfig.queued).label}
                  </Badge>
                </CardContent>
              </Card>

              <Card className="bg-white/5 border-white/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-base">Extracted Lines ({jobDetail.lines.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {jobDetail.lines.map((line) => (
                      <div key={line.id} className={`p-3 rounded-lg border ${line.matchStatus === "auto_matched" ? "border-emerald-500/20 bg-emerald-500/5" : line.matchStatus === "review_required" ? "border-amber-500/20 bg-amber-500/5" : "border-red-500/20 bg-red-500/5"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{line.itemName}</p>
                            <div className="flex flex-wrap gap-3 mt-1 text-xs text-white/50">
                              {line.batchNo && <span>Batch: {line.batchNo}</span>}
                              {line.expiryDate && <span>Exp: {line.expiryDate}</span>}
                              {line.mrp && <span>MRP: ₹{line.mrp}</span>}
                              {line.purchaseRate && <span>Rate: ₹{line.purchaseRate}</span>}
                              {line.qty && <span>Qty: {line.qty}</span>}
                              {line.gstRate && <span>GST: {line.gstRate}%</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-xs font-mono ${confidenceColor(line.confidence)}`}>{line.confidence}%</span>
                            {line.matchStatus === "review_required" && (
                              <Button size="sm" variant="outline" className="h-6 text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                                onClick={() => reviewLine.mutate({ lineId: line.id, action: "approve" })}>
                                Approve
                              </Button>
                            )}
                            {line.matchStatus !== "rejected" && (
                              <Button size="sm" variant="ghost" className="h-6 text-xs text-red-400 hover:bg-red-500/10"
                                onClick={() => reviewLine.mutate({ lineId: line.id, action: "reject" })}>
                                Reject
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {jobDetail.lines.length === 0 && (
                      <p className="text-center py-8 text-white/40">
                        {jobDetail.job.status === "processing" ? "Extracting lines..." : "No lines extracted"}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )
        )}
      </div>
    </div>
  );
}
