"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import AdminHeader from "@/components/admin/AdminHeader";

interface Visit {
  id: string;
  token: string;
  visitId: string;
  visitDate: string;
  status: string;
  paymentType: string | null;
  cancelReason: string | null;
  patient: { prn: string; name: string; phone?: string | null; deletedAt?: string | null };
  doctor?: { user: { name: string } } | null;
}

const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  WAITING:         { bg: "#FEF3C7", text: "#92400E" },
  ASSIGNED:        { bg: "#DBEAFE", text: "#1E40AF" },
  IN_CONSULTATION: { bg: "#D1FAE5", text: "#065F46" },
  COMPLETED:       { bg: "#F0FDF4", text: "#166534" },
  CANCELLED:       { bg: "#FEE2E2", text: "#991B1B" },
  SCHEDULED:       { bg: "#EDE9FE", text: "#5B21B6" },
};

const ALL_STATUSES = ["", "WAITING", "ASSIGNED", "IN_CONSULTATION", "COMPLETED", "CANCELLED", "SCHEDULED"];

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
}

export default function AdminVisitsPage() {
  const router = useRouter();
  const [visits,   setVisits]   = useState<Visit[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const [status,   setStatus]   = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status)   params.set("status", status);
      if (dateFrom) params.set("from",   dateFrom);
      if (dateTo)   params.set("to",     dateTo);
      const res  = await fetch(`/api/admin/visits?${params}`);
      if (res.status === 401 || res.status === 403) { router.push("/login"); return; }
      const data = await res.json();
      setVisits(data.visits ?? []);
    } catch { toast.error("Failed to load visits"); }
    finally { setLoading(false); }
  }, [status, dateFrom, dateTo, router]);

  useEffect(() => { load(); }, [load]);

  const filtered = search.trim()
    ? visits.filter(v =>
        v.patient.name.toLowerCase().includes(search.toLowerCase()) ||
        v.patient.prn.toLowerCase().includes(search.toLowerCase()) ||
        v.token.toLowerCase().includes(search.toLowerCase())
      )
    : visits;

  const counts = visits.reduce<Record<string, number>>((acc, v) => {
    acc[v.status] = (acc[v.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ minHeight: "100vh", background: "#F5F4F2", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif" }}>
      <AdminHeader />

      <main className="av-main" style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#0C1929", marginBottom: 4 }}>All Visits</div>
          <div style={{ fontSize: 13, color: "#888" }}>Complete visit log across all patients</div>
        </div>

        {/* Summary pills */}
        {!loading && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
            {Object.entries(counts).map(([s, n]) => {
              const c = STATUS_COLOR[s] ?? { bg: "#F3F4F6", text: "#374151" };
              return (
                <div key={s} style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: c.bg, color: c.text, cursor: "pointer", border: status === s ? "2px solid currentColor" : "2px solid transparent" }}
                  onClick={() => setStatus(prev => prev === s ? "" : s)}>
                  {s.replace(/_/g," ")} · {n}
                </div>
              );
            })}
          </div>
        )}

        {/* Filters */}
        <div className="av-filters" style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search patient, PRN, token…"
            style={S.input}
          />
          <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...S.input, maxWidth: 190 }}>
            {ALL_STATUSES.map(s => <option key={s} value={s}>{s ? s.replace(/_/g," ") : "All Statuses"}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ ...S.input, maxWidth: 160 }} />
          <span style={{ alignSelf: "center", color: "#aaa", fontSize: 13 }}>to</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ ...S.input, maxWidth: 160 }} />
          {(search || status || dateFrom || dateTo) && (
            <button onClick={() => { setSearch(""); setStatus(""); setDateFrom(""); setDateTo(""); }} style={S.clearBtn}>Clear</button>
          )}
          <div style={{ marginLeft: "auto", alignSelf: "center", fontSize: 13, color: "#888", fontWeight: 500 }}>
            {filtered.length} visit{filtered.length !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Table */}
        <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 1px 6px rgba(0,0,0,.05)", overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: 60, textAlign: "center", color: "#aaa" }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 60, textAlign: "center", color: "#aaa" }}>No visits found.</div>
          ) : (
            <div className="av-table-wrap" style={{ overflowX: "auto" }}>
              <table className="av-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1.5px solid #F0EEEA", background: "#FAFAF8" }}>
                    {["Date & Time", "Token", "Patient", "PRN", "Doctor", "Status", "Payment", "Note"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#999", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(v => {
                    const c = STATUS_COLOR[v.status] ?? { bg: "#F3F4F6", text: "#374151" };
                    return (
                      <tr key={v.id} style={{ borderBottom: "1px solid #F8F7F5" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#FAFAF8")}
                        onMouseLeave={e => (e.currentTarget.style.background = "")}>
                        <td data-label="Date" style={{ padding: "11px 14px", color: "#555", whiteSpace: "nowrap", fontSize: 12 }}>{fmt(v.visitDate)}</td>
                        <td data-label="Token" style={{ padding: "11px 14px", fontWeight: 800, fontSize: 15, color: "#0C1929" }}>{v.token}</td>
                        <td data-label="Patient" style={{ padding: "11px 14px", fontWeight: 600, color: "#111" }}>
                          {v.patient.name}
                          {v.patient.deletedAt && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, background: "#F3F4F6", color: "#9CA3AF", borderRadius: 6, padding: "2px 6px", verticalAlign: "middle" }}>removed</span>}
                        </td>
                        <td data-label="PRN" style={{ padding: "11px 14px", fontSize: 12, color: "#6D28D9", fontWeight: 700 }}>{v.patient.prn}</td>
                        <td data-label="Doctor" style={{ padding: "11px 14px", color: "#555" }}>{v.doctor?.user.name ?? <span style={{ color: "#ccc" }}>—</span>}</td>
                        <td data-label="Status" style={{ padding: "11px 14px" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 12, background: c.bg, color: c.text, whiteSpace: "nowrap" }}>
                            {v.status.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td data-label="Payment" style={{ padding: "11px 14px", color: "#777", fontSize: 12 }}>{v.paymentType ?? <span style={{ color: "#ccc" }}>—</span>}</td>
                        <td data-label="Note" style={{ padding: "11px 14px", color: "#DC2626", fontSize: 12, maxWidth: 200 }}>
                          {v.cancelReason ?? <span style={{ color: "#ccc" }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <style>{`
        input::placeholder, textarea::placeholder { color: #888 !important; opacity: 1; }
        select option { color: #111; }
        @media (max-width: 639px) {
          .av-main { padding: 20px 14px !important; }
          .av-table-wrap { overflow-x: visible !important; }
          .av-table thead { display: none; }
          .av-table tbody tr {
            display: block;
            border-radius: 12px;
            border: 1.5px solid #E8E6E3 !important;
            margin-bottom: 10px;
            padding: 2px 0;
            background: #fff;
          }
          .av-table tbody td {
            display: flex !important;
            align-items: flex-start;
            justify-content: space-between;
            gap: 10px;
            padding: 9px 14px !important;
            border-bottom: 1px solid #F5F3F0;
            font-size: 13px !important;
            white-space: normal !important;
            max-width: 100% !important;
          }
          .av-table tbody td:last-child { border-bottom: none; }
          .av-table tbody td::before {
            content: attr(data-label);
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: .06em;
            color: #999;
            min-width: 70px;
            flex-shrink: 0;
            padding-top: 2px;
          }
        }
        @media (min-width: 640px) and (max-width: 1023px) {
          .av-main { padding: 24px 18px !important; }
        }
      `}</style>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  input:    { padding: "9px 14px", border: "1.5px solid #E2E0DC", borderRadius: 9, fontSize: 13, outline: "none", background: "#fff", flex: 1, minWidth: 180, color: "#111" },
  clearBtn: { padding: "9px 16px", background: "transparent", color: "#666", border: "1.5px solid #D0CEC9", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer" },
};
