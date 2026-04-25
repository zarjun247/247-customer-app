import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  MessageSquare, Plus, ChevronRight, Clock, CheckCircle,
  AlertCircle, XCircle, Loader2, ArrowLeft, Tag
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";

// ─── Types ────────────────────────────────────────────────────────────────────

type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
type TicketCategory = "order" | "prescription" | "delivery" | "billing" | "product" | "account" | "other";
type TicketPriority = "low" | "normal" | "high" | "urgent";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusConfig(status: TicketStatus) {
  const map: Record<TicketStatus, { label: string; icon: React.ReactNode; color: string }> = {
    open: {
      label: "Open",
      icon: <Clock className="w-3.5 h-3.5" />,
      color: "bg-amber-500/15 text-amber-400 border-amber-500/25",
    },
    in_progress: {
      label: "In Progress",
      icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
      color: "bg-blue-500/15 text-blue-400 border-blue-500/25",
    },
    resolved: {
      label: "Resolved",
      icon: <CheckCircle className="w-3.5 h-3.5" />,
      color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
    },
    closed: {
      label: "Closed",
      icon: <XCircle className="w-3.5 h-3.5" />,
      color: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
    },
  };
  return map[status] ?? { label: status, icon: null, color: "bg-zinc-500/15 text-zinc-400" };
}

function priorityDot(priority: TicketPriority) {
  const map: Record<TicketPriority, string> = {
    low: "bg-zinc-500",
    normal: "bg-blue-500",
    high: "bg-amber-500",
    urgent: "bg-red-500",
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${map[priority]}`} />;
}

function categoryLabel(cat: TicketCategory) {
  const map: Record<TicketCategory, string> = {
    order: "Order",
    prescription: "Prescription",
    delivery: "Delivery",
    billing: "Billing",
    product: "Product",
    account: "Account",
    other: "Other",
  };
  return map[cat] ?? cat;
}

// ─── New Ticket Form ──────────────────────────────────────────────────────────

function NewTicketForm({ onSuccess }: { onSuccess: () => void }) {
  const [category, setCategory] = useState<TicketCategory>("other");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [orderId, setOrderId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMutation = trpc.helpdesk.create.useMutation({
    onSuccess: () => {
      setSubject("");
      setDescription("");
      setOrderId("");
      setError(null);
      onSuccess();
    },
    onError: (err) => setError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (subject.trim().length < 5) {
      setError("Subject must be at least 5 characters.");
      return;
    }
    if (description.trim().length < 10) {
      setError("Please provide more detail in the description.");
      return;
    }
    setError(null);
    createMutation.mutate({
      category,
      subject: subject.trim(),
      description: description.trim(),
      priority,
      orderId: orderId ? parseInt(orderId) : undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-zinc-400 mb-1.5 block">Category</label>
          <Select value={category} onValueChange={(v) => setCategory(v as TicketCategory)}>
            <SelectTrigger className="bg-[#141416] border-white/10 text-zinc-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#141416] border-white/10">
              {(["order", "prescription", "delivery", "billing", "product", "account", "other"] as TicketCategory[]).map((c) => (
                <SelectItem key={c} value={c} className="text-zinc-200 focus:bg-white/10">
                  {categoryLabel(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs text-zinc-400 mb-1.5 block">Priority</label>
          <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
            <SelectTrigger className="bg-[#141416] border-white/10 text-zinc-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#141416] border-white/10">
              {(["low", "normal", "high", "urgent"] as TicketPriority[]).map((p) => (
                <SelectItem key={p} value={p} className="text-zinc-200 focus:bg-white/10 capitalize">
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <label className="text-xs text-zinc-400 mb-1.5 block">Subject</label>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Brief description of your issue"
          className="bg-[#141416] border-white/10 text-zinc-200 placeholder:text-zinc-600"
          maxLength={255}
        />
      </div>

      <div>
        <label className="text-xs text-zinc-400 mb-1.5 block">Description</label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Please describe your issue in detail…"
          className="bg-[#141416] border-white/10 text-zinc-200 placeholder:text-zinc-600 resize-none"
          rows={4}
          maxLength={5000}
        />
      </div>

      <div>
        <label className="text-xs text-zinc-400 mb-1.5 block">
          Order ID <span className="text-zinc-600">(optional)</span>
        </label>
        <Input
          value={orderId}
          onChange={(e) => setOrderId(e.target.value.replace(/\D/g, ""))}
          placeholder="e.g. 12345"
          className="bg-[#141416] border-white/10 text-zinc-200 placeholder:text-zinc-600"
          type="text"
          inputMode="numeric"
        />
      </div>

      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" /> {error}
        </p>
      )}

      <Button
        type="submit"
        className="w-full bg-teal-500 hover:bg-teal-400 text-black font-semibold"
        disabled={createMutation.isPending}
      >
        {createMutation.isPending ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting…</>
        ) : (
          "Submit ticket"
        )}
      </Button>
    </form>
  );
}

// ─── Ticket Detail ────────────────────────────────────────────────────────────

function TicketDetail({ ticketId, onBack }: { ticketId: number; onBack: () => void }) {
  const { data: ticket, isLoading } = trpc.helpdesk.get.useQuery({ ticketId });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-500 text-sm">Ticket not found.</p>
        <Button variant="outline" size="sm" className="mt-3 border-white/20 text-zinc-300" onClick={onBack}>
          Back
        </Button>
      </div>
    );
  }

  const { label, icon, color } = statusConfig(ticket.status as TicketStatus);

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        My tickets
      </button>

      <div className="rounded-xl border border-white/10 bg-[#0E0E10] p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-zinc-500 mb-1">Ticket #{ticket.id}</p>
            <h2 className="text-base font-semibold text-zinc-100">{ticket.subject}</h2>
          </div>
          <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${color}`}>
            {icon} {label}
          </span>
        </div>

        <div className="flex flex-wrap gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-zinc-400">
            <Tag className="w-3.5 h-3.5" />
            {categoryLabel(ticket.category as TicketCategory)}
          </span>
          <span className="flex items-center gap-1.5 text-zinc-400">
            {priorityDot(ticket.priority as TicketPriority)}
            {ticket.priority} priority
          </span>
          {ticket.orderId && (
            <span className="text-zinc-400">Order #{ticket.orderId}</span>
          )}
        </div>

        <div>
          <p className="text-xs text-zinc-500 mb-1.5">Description</p>
          <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
            {ticket.description}
          </p>
        </div>

        <div className="text-xs text-zinc-500">
          Submitted {new Date(ticket.createdAt).toLocaleString("en-IN")}
        </div>
      </div>

      {/* Resolution note */}
      {ticket.resolutionNote && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <p className="text-xs font-semibold text-emerald-400 mb-2">Resolution note</p>
          <p className="text-sm text-zinc-300 leading-relaxed">{ticket.resolutionNote}</p>
          {ticket.resolvedAt && (
            <p className="text-xs text-zinc-500 mt-2">
              Resolved {new Date(ticket.resolvedAt).toLocaleString("en-IN")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Helpdesk() {
  const { user } = useAuth();
  const [view, setView] = useState<"list" | "new" | "detail">("list");
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const { data: tickets, isLoading } = trpc.helpdesk.list.useQuery({});

  function handleTicketCreated() {
    utils.helpdesk.list.invalidate();
    setView("list");
  }

  if (view === "new") {
    return (
      <div className="min-h-screen bg-[#0A0A0B] text-zinc-100">
        <div className="max-w-xl mx-auto px-4 py-8 pb-24">
          <button
            onClick={() => setView("list")}
            className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            My tickets
          </button>
          <h1 className="text-xl font-bold text-zinc-100 mb-6">New support ticket</h1>
          <div className="rounded-xl border border-white/10 bg-[#0E0E10] p-5">
            <NewTicketForm onSuccess={handleTicketCreated} />
          </div>
        </div>
      </div>
    );
  }

  if (view === "detail" && selectedTicketId) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] text-zinc-100">
        <div className="max-w-xl mx-auto px-4 py-8 pb-24">
          <TicketDetail
            ticketId={selectedTicketId}
            onBack={() => { setView("list"); setSelectedTicketId(null); }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-zinc-100">
      <div className="max-w-xl mx-auto px-4 py-8 pb-24">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-zinc-100">Support</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              Questions, issues, or feedback — we're here to help.
            </p>
          </div>
          <Button
            size="sm"
            className="bg-teal-500 hover:bg-teal-400 text-black font-semibold gap-1.5"
            onClick={() => setView("new")}
          >
            <Plus className="w-4 h-4" />
            New ticket
          </Button>
        </div>

        {/* Tickets list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
          </div>
        ) : !tickets || tickets.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-[#0E0E10] p-10 text-center">
            <MessageSquare className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
            <p className="text-sm font-medium text-zinc-300">No tickets yet</p>
            <p className="text-xs text-zinc-500 mt-1 mb-4">
              Have a question or issue? We'll get back to you promptly.
            </p>
            <Button
              size="sm"
              className="bg-teal-500 hover:bg-teal-400 text-black font-semibold"
              onClick={() => setView("new")}
            >
              Open a ticket
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {tickets.map((ticket) => {
              const { label, icon, color } = statusConfig(ticket.status as TicketStatus);
              return (
                <button
                  key={ticket.id}
                  onClick={() => { setSelectedTicketId(ticket.id); setView("detail"); }}
                  className="w-full text-left rounded-xl border border-white/10 bg-[#0E0E10] p-4 hover:border-white/20 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-zinc-500">#{ticket.id}</span>
                        <span className="text-xs text-zinc-500">·</span>
                        <span className="text-xs text-zinc-500">{categoryLabel(ticket.category as TicketCategory)}</span>
                      </div>
                      <p className="text-sm font-medium text-zinc-200 truncate">{ticket.subject}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {new Date(ticket.createdAt).toLocaleDateString("en-IN")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${color}`}>
                        {icon} {label}
                      </span>
                      <ChevronRight className="w-4 h-4 text-zinc-600" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
