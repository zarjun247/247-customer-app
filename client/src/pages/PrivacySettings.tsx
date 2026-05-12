import { useState } from "react";
import { trpc } from "@/lib/trpc";

type Tab =
  | "rights"
  | "consent_log"
  | "export"
  | "rectification"
  | "grievance"
  | "erasure";

const TAB_LABELS: Record<Tab, string> = {
  rights: "Your Rights",
  consent_log: "Consent History",
  export: "Export My Data",
  rectification: "Correct My Data",
  grievance: "File Grievance",
  erasure: "Delete My Data",
};

function RightsTab() {
  return (
    <div className="space-y-4 text-sm text-gray-700">
      <p className="text-gray-600">
        Under the{" "}
        <strong>India Digital Personal Data Protection (DPDP) Act 2023</strong>,
        you have the following rights over your personal data held by 24/7
        Pharmacy.
      </p>
      <div className="grid gap-3">
        {[
          {
            title: "Right to Access",
            desc: "Request a copy of all personal data we hold about you.",
          },
          {
            title: "Right to Correction",
            desc: "Request correction of inaccurate or incomplete data.",
          },
          {
            title: "Right to Erasure",
            desc: "Request deletion of your personal data (7-day confirmation window).",
          },
          {
            title: "Right to Grievance Redressal",
            desc: "File a complaint with our Data Protection Officer (DPO).",
          },
          {
            title: "Right to Nominate",
            desc: "Nominate a person to exercise rights on your behalf in case of death or incapacity.",
          },
        ].map(r => (
          <div key={r.title} className="border rounded-lg p-3 bg-gray-50">
            <p className="font-semibold mb-1">{r.title}</p>
            <p className="text-gray-600">{r.desc}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 pt-2">
        SLA: access/export within 30 days. Grievances addressed within 30 days.
        Contact DPO at{" "}
        <a
          href="mailto:privacy@247pharmacy.in"
          className="text-blue-600 hover:underline"
        >
          privacy@247pharmacy.in
        </a>
        .
      </p>
    </div>
  );
}

function ConsentLogTab() {
  const log = trpc.dsr.consentLog.useQuery();
  const rows = log.data?.entries ?? [];

  return (
    <div>
      {log.isLoading && (
        <p className="text-gray-500 text-sm">Loading consent history…</p>
      )}
      {log.error && (
        <p className="text-red-600 text-sm">Error: {log.error.message}</p>
      )}
      {!log.isLoading && rows.length === 0 && (
        <p className="text-gray-500 text-sm">No consent records found.</p>
      )}
      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((entry, i) => (
            <div key={i} className="border rounded-lg p-3 text-sm">
              <div className="flex justify-between">
                <span className="font-medium capitalize">
                  {entry.consentType.replace(/_/g, " ")}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-xs font-semibold ${entry.status === "granted" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                >
                  {entry.status}
                </span>
              </div>
              <p className="text-gray-500 text-xs mt-1">
                {entry.grantedAt
                  ? new Date(entry.grantedAt).toLocaleDateString()
                  : "—"}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExportTab() {
  const [format, setFormat] = useState<"json" | "csv">("json");
  const [result, setResult] = useState<{
    exportUrl?: string;
    base64?: string;
  } | null>(null);
  const exportMut = trpc.dsr.export.useMutation({
    onSuccess: (data: any) => setResult(data),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Request a copy of all personal data we hold about you. The export will
        include your profile, orders, prescriptions, and consent records.
      </p>
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium">Format:</label>
        <div className="flex gap-3">
          {(["json", "csv"] as const).map(f => (
            <label
              key={f}
              className="flex items-center gap-2 text-sm cursor-pointer"
            >
              <input
                type="radio"
                name="format"
                value={f}
                checked={format === f}
                onChange={() => setFormat(f)}
              />
              {f.toUpperCase()}
            </label>
          ))}
        </div>
      </div>
      <button
        onClick={() => exportMut.mutate({ format })}
        disabled={exportMut.isPending}
        className="px-4 py-2 bg-gray-800 text-white rounded text-sm disabled:opacity-50"
      >
        {exportMut.isPending ? "Preparing export…" : "Request Data Export"}
      </button>
      {exportMut.error && (
        <p className="text-red-600 text-sm">{exportMut.error.message}</p>
      )}
      {result && (
        <div className="border rounded-lg p-3 bg-green-50 text-sm">
          <p className="font-semibold text-green-800 mb-1">Export ready</p>
          <p className="text-green-700 text-xs">
            Your data export has been prepared. If a download link was sent to
            your email, please check your inbox.
          </p>
        </div>
      )}
    </div>
  );
}

function RectificationTab() {
  const [fields, setFields] = useState([
    { field: "", oldValue: "", newValue: "", reason: "" },
  ]);
  const [submitted, setSubmitted] = useState(false);
  const rectify = trpc.dsr.rectification.useMutation({
    onSuccess: () => setSubmitted(true),
  });

  function updateField(index: number, key: string, value: string) {
    setFields(prev =>
      prev.map((f, i) => (i === index ? { ...f, [key]: value } : f))
    );
  }

  if (submitted) {
    return (
      <div className="border rounded-lg p-4 bg-blue-50 text-sm">
        <p className="font-semibold text-blue-800 mb-1">
          Correction request submitted
        </p>
        <p className="text-blue-700">
          Our team will review your request within 30 days and update your
          records accordingly.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Request correction of inaccurate or incomplete personal data. Provide
        the field name, current value, and the correct value.
      </p>
      {fields.map((f, i) => (
        <div key={i} className="border rounded-lg p-3 space-y-2 bg-gray-50">
          <input
            className="w-full border rounded px-2 py-1.5 text-sm"
            placeholder="Field name (e.g. name, phone, address)"
            value={f.field}
            onChange={e => updateField(i, "field", e.target.value)}
          />
          <input
            className="w-full border rounded px-2 py-1.5 text-sm"
            placeholder="Current (incorrect) value"
            value={f.oldValue}
            onChange={e => updateField(i, "oldValue", e.target.value)}
          />
          <input
            className="w-full border rounded px-2 py-1.5 text-sm"
            placeholder="Correct value"
            value={f.newValue}
            onChange={e => updateField(i, "newValue", e.target.value)}
          />
          <textarea
            className="w-full border rounded px-2 py-1.5 text-sm h-16 resize-none"
            placeholder="Reason for correction (min 5 chars)"
            value={f.reason}
            onChange={e => updateField(i, "reason", e.target.value)}
          />
        </div>
      ))}
      <div className="flex gap-3">
        {fields.length < 5 && (
          <button
            onClick={() =>
              setFields(prev => [
                ...prev,
                { field: "", oldValue: "", newValue: "", reason: "" },
              ])
            }
            className="px-3 py-1.5 border rounded text-sm"
          >
            + Add another field
          </button>
        )}
        <button
          onClick={() => rectify.mutate({ fieldChanges: fields })}
          disabled={
            rectify.isPending ||
            fields.some(f => !f.field || f.reason.length < 5)
          }
          className="px-4 py-2 bg-gray-800 text-white rounded text-sm disabled:opacity-50"
        >
          {rectify.isPending ? "Submitting…" : "Submit Correction Request"}
        </button>
      </div>
      {rectify.error && (
        <p className="text-red-600 text-sm">{rectify.error.message}</p>
      )}
    </div>
  );
}

function GrievanceTab() {
  const [text, setText] = useState("");
  const [category, setCategory] = useState("data_use");
  const [submitted, setSubmitted] = useState(false);
  const grievance = trpc.dsr.grievance.useMutation({
    onSuccess: () => setSubmitted(true),
  });

  if (submitted) {
    return (
      <div className="border rounded-lg p-4 bg-blue-50 text-sm">
        <p className="font-semibold text-blue-800 mb-1">
          Grievance filed successfully
        </p>
        <p className="text-blue-700">
          Your grievance has been forwarded to the Data Protection Officer. You
          will receive a response within 30 days.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        If you believe your personal data has been mishandled, file a grievance
        with our Data Protection Officer (DPO). We are required to respond
        within 30 days under DPDP Act 2023.
      </p>
      <div>
        <label className="block text-sm font-medium mb-1">Category</label>
        <select
          className="border rounded px-3 py-1.5 text-sm w-full max-w-xs"
          value={category}
          onChange={e => setCategory(e.target.value)}
        >
          <option value="data_use">Unauthorised data use</option>
          <option value="data_breach">Suspected data breach</option>
          <option value="consent">Consent not respected</option>
          <option value="access_denied">Access request not fulfilled</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">
          Describe your grievance
        </label>
        <textarea
          className="w-full border rounded px-3 py-2 text-sm h-32 resize-none"
          placeholder="Please describe the issue in detail (min 10 chars)"
          value={text}
          onChange={e => setText(e.target.value)}
        />
      </div>
      <button
        onClick={() => grievance.mutate({ grievanceText: text, category })}
        disabled={text.length < 10 || grievance.isPending}
        className="px-4 py-2 bg-gray-800 text-white rounded text-sm disabled:opacity-50"
      >
        {grievance.isPending ? "Submitting…" : "File Grievance"}
      </button>
      {grievance.error && (
        <p className="text-red-600 text-sm">{grievance.error.message}</p>
      )}
    </div>
  );
}

function ErasureTab() {
  const [scope, setScope] = useState<
    "all" | "marketing_only" | "behavioral_only"
  >("marketing_only");
  const [result, setResult] = useState<{
    confirmationToken?: string;
    message?: string;
  } | null>(null);
  const erasure = trpc.dsr.erasure.useMutation({
    onSuccess: (data: any) => setResult(data),
  });

  return (
    <div className="space-y-4">
      <div className="border-l-4 border-red-500 bg-red-50 p-3 rounded-r text-sm text-red-800">
        <strong>Warning:</strong> Erasure is irreversible. A 7-day confirmation
        window applies. You will receive a confirmation email before any data is
        deleted.
      </div>
      <p className="text-sm text-gray-600">
        Request deletion of your personal data. Select the scope of erasure
        below.
      </p>
      <div className="space-y-2">
        {(
          [
            {
              value: "marketing_only",
              label: "Marketing data only",
              desc: "Remove marketing preferences and contact opt-ins",
            },
            {
              value: "behavioral_only",
              label: "Behavioral data only",
              desc: "Remove browsing history and analytics data",
            },
            {
              value: "all",
              label: "All personal data",
              desc: "Full erasure — account and all associated records will be anonymised",
            },
          ] as const
        ).map(opt => (
          <label
            key={opt.value}
            className={`flex items-start gap-3 border rounded-lg p-3 cursor-pointer ${scope === opt.value ? "border-gray-800 bg-gray-50" : "hover:bg-gray-50"}`}
          >
            <input
              type="radio"
              name="scope"
              value={opt.value}
              checked={scope === opt.value}
              onChange={() => setScope(opt.value)}
              className="mt-0.5"
            />
            <div>
              <p className="font-medium text-sm">{opt.label}</p>
              <p className="text-xs text-gray-500">{opt.desc}</p>
            </div>
          </label>
        ))}
      </div>

      {!result && (
        <button
          onClick={() => erasure.mutate({ scope })}
          disabled={erasure.isPending}
          className="px-4 py-2 bg-red-600 text-white rounded text-sm disabled:opacity-50"
        >
          {erasure.isPending ? "Submitting…" : "Request Erasure"}
        </button>
      )}
      {erasure.error && (
        <p className="text-red-600 text-sm">{erasure.error.message}</p>
      )}

      {result && (
        <div className="border rounded-lg p-4 bg-yellow-50 text-sm">
          <p className="font-semibold text-yellow-800 mb-2">
            Erasure request submitted — confirmation required
          </p>
          <p className="text-yellow-700 text-xs">
            A confirmation link has been sent to your registered email address.
            You must click the link within 7 days to confirm the erasure. No
            data will be deleted until you confirm.
          </p>
        </div>
      )}
    </div>
  );
}

export default function PrivacySettings() {
  const [tab, setTab] = useState<Tab>("rights");

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Privacy &amp; Data Rights</h1>
      <p className="text-sm text-gray-500 mb-6">
        Manage your personal data rights under the India DPDP Act 2023.
      </p>

      <div className="flex gap-1 mb-6 border-b pb-2 flex-wrap">
        {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 rounded-t text-xs font-medium ${tab === t ? "bg-gray-800 text-white" : "text-gray-600 hover:bg-gray-100"}`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === "rights" && <RightsTab />}
      {tab === "consent_log" && <ConsentLogTab />}
      {tab === "export" && <ExportTab />}
      {tab === "rectification" && <RectificationTab />}
      {tab === "grievance" && <GrievanceTab />}
      {tab === "erasure" && <ErasureTab />}
    </div>
  );
}
