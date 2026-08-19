"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import AdminHeader from "@/components/admin/AdminHeader";

interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId?: string;
  userRole?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  user?: { name: string; email: string };
}

const ACTION_COLOR: Record<string, { bg: string; text: string }> = {
  CREATE:             { bg: "#D1FAE5", text: "#065F46" },
  UPDATE:             { bg: "#DBEAFE", text: "#1E40AF" },
  DELETE:             { bg: "#FEE2E2", text: "#991B1B" },
  LOGIN:              { bg: "#EDE9FE", text: "#5B21B6" },
  LOGOUT:             { bg: "#F3F4F6", text: "#374151" },
  SAVE_CONSULTATION:  { bg: "#FEF3C7", text: "#92400E" },
};

const ALL_ACTIONS = ["", "CREATE", "UPDATE", "DELETE", "LOGIN", "LOGOUT", "SAVE_CONSULTATION"];
const ALL_ENTITIES = ["", "Patient", "Doctor", "Visit", "User", "PatientHistory"];

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
}

export default function AuditPage() {
  const router = useRouter();
  const [logs,    setLogs]    = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [total,   setTotal]   = useState(0);
  const [pages,   setPages]   = useState(1);
  const [page,    setPage]    = useState(1);

  const [action,  setAction]  = useState("");
  const [entity,  setEntity]  = useState("");
  const [from,    setFrom]    = useState("");
  const [to,      setTo]      = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), limit: "50" });
      if (action) p.set("action", action);
      if (entity) p.set("entity", entity);
      if (from)   p.set("from", from);
      if (to)     p.set("to", to);
      const res = await fetch(`/api/admin/audit?${p}`);
      if (res.status === 401 || res.status === 403) { router.push("/login"); return; }
      const d = await res.json();
      setLogs(d.logs ?? []);
      setTotal(d.total ?? 0);
      setPages(d.pages ?? 1);
    } finally { setLoading(false); }
  }, [page, action, entity, from, to, router]);

  useEffect(() => { load(); }, [load]);

  const clear = () => { setAction(""); setEntity(""); setFrom(""); setTo(""); setPage(1); };

  return (
    <div style={S.page}>
      <AdminHeader />

      <main className="au-main" style={S.main}>
        <div style={S.titleRow}>
          <div>
            <div style={S.pageTitle}>Audit Log</div>
            <div style={S.pageSub}>Complete record of all system actions</div>
          </div>
          <div style={S.totalBadge}>{total.toLocaleString()} events</div>
        </div>

        {/* Filters */}
        <div className="au-filters" style={S.filters}>
          <select value={action} onChange={e => { setAction(e.target.value); setPage(1); }} style={S.filterInput}>
            {ALL_ACTIONS.map(a => <option key={a} value={a}>{a || "All Actions"}</option>)}
          </select>
          <select value={entity} onChange={e => { setEntity(e.target.value); setPage(1); }} style={S.filterInput}>
            {ALL_ENTITIES.map(e => <option key={e} value={e}>{e || "All Entities"}</option>)}
          </select>
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} style={{ ...S.filterInput, maxWidth: 160 }} />
          <span style={{ alignSelf: "center", color: "#aaa", fontSize: 13 }}>to</span>
          <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} style={{ ...S.filterInput, maxWidth: 160 }} />
          {(action || entity || from || to) && (
            <button onClick={clear} style={S.clearBtn}>Clear</button>
          )}
        </div>

        {/* Table */}
        <div style={S.card}>
          {loading ? (
            <div style={S.empty}>Loading…</div>
          ) : logs.length === 0 ? (
            <div style={S.empty}>No audit events found.</div>
          ) : (
            <div className="au-table-wrap" style={{ overflowX: "auto" }}>
              <table className="au-table" style={S.table}>
                <thead>
                  <tr style={S.thead}>
                    {["Timestamp", "Actor", "Role", "Action", "Entity", "Details"].map(h => (
                      <th key={h} style={S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => {
                    const ac = ACTION_COLOR[log.action] ?? { bg: "#F3F4F6", text: "#374151" };
                    const meta = log.metadata ? JSON.stringify(log.metadata) : "";
                    return (
                      <tr key={log.id} style={S.tr}
                        onMouseEnter={e => (e.currentTarget.style.background = "#FAFAF8")}
                        onMouseLeave={e => (e.currentTarget.style.background = "")}>
                        <td data-label="Timestamp" style={{ ...S.td, color: "#555", fontSize: 12, whiteSpace: "nowrap" }}>{fmt(log.createdAt)}</td>
                        <td data-label="Actor" style={{ ...S.td, fontWeight: 600, color: "#111" }}>
                          {log.user?.name ?? <span style={{ color: "#aaa" }}>System</span>}
                          {log.user?.email && <div style={{ fontSize: 11, color: "#888", fontWeight: 400 }}>{log.user.email}</div>}
                        </td>
                        <td data-label="Role" style={S.td}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#555", background: "#F3F4F6", padding: "2px 8px", borderRadius: 8 }}>
                            {log.userRole ?? "—"}
                          </span>
                        </td>
                        <td data-label="Action" style={S.td}>
                          <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 10, background: ac.bg, color: ac.text }}>
                            {log.action}
                          </span>
                        </td>
                        <td data-label="Entity" style={{ ...S.td, color: "#555" }}>
                          <div>{log.entity}</div>
                          {log.entityId && <div style={{ fontSize: 11, color: "#aaa", marginTop: 1 }}>{log.entityId.slice(0, 12)}…</div>}
                        </td>
                        <td data-label="Details" style={{ ...S.td, color: "#777", fontSize: 12, maxWidth: 220 }}>
                          {meta ? <span style={{ wordBreak: "break-all" }}>{meta.slice(0, 120)}{meta.length > 120 ? "…" : ""}</span> : <span style={{ color: "#ccc" }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div style={S.pagination}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={S.pageBtn}>← Prev</button>
            <span style={{ fontSize: 13, color: "#666" }}>Page {page} of {pages}</span>
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} style={S.pageBtn}>Next →</button>
          </div>
        )}
      </main>

      <style>{`
        input::placeholder { color: #888 !important; opacity: 1; }
        select option { color: #111; }
        @media (max-width: 639px) {
          .au-main { padding: 16px 14px !important; }
          .au-filters { flex-direction: column !important; }
          .au-filters input, .au-filters select { max-width: 100% !important; }
          .au-table-wrap { overflow-x: visible !important; }
          .au-table thead { display: none; }
          .au-table tbody tr {
            display: block;
            border-radius: 12px;
            border: 1.5px solid #E8E6E3 !important;
            margin-bottom: 10px;
            padding: 2px 0;
            background: #fff;
          }
          .au-table tbody td {
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
          .au-table tbody td:last-child { border-bottom: none; }
          .au-table tbody td::before {
            content: attr(data-label);
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: .06em;
            color: #999;
            min-width: 72px;
            flex-shrink: 0;
            padding-top: 2px;
          }
        }
        @media (min-width: 640px) and (max-width: 1023px) {
          .au-main { padding: 24px 18px !important; }
        }
      `}</style>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page:        { minHeight: "100vh", background: "#F5F4F2", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif" },
  main:        { maxWidth: 1280, margin: "0 auto", padding: "32px 24px" },
  titleRow:    { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 },
  pageTitle:   { fontSize: 22, fontWeight: 700, color: "#0C1929" },
  pageSub:     { fontSize: 13, color: "#888", marginTop: 4 },
  totalBadge:  { fontSize: 13, fontWeight: 700, color: "#555", background: "#fff", border: "1.5px solid #E2E0DC", borderRadius: 10, padding: "6px 14px" },
  filters:     { display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" as const, alignItems: "center" },
  filterInput: { padding: "9px 14px", border: "1.5px solid #E2E0DC", borderRadius: 9, fontSize: 13, outline: "none", background: "#fff", color: "#111", flex: 1, minWidth: 150 },
  clearBtn:    { padding: "9px 16px", background: "transparent", color: "#666", border: "1.5px solid #D0CEC9", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  card:        { background: "#fff", borderRadius: 14, boxShadow: "0 1px 6px rgba(0,0,0,.05)", overflow: "hidden" },
  empty:       { padding: "60px 0", textAlign: "center" as const, color: "#aaa", fontSize: 14 },
  table:       { width: "100%", borderCollapse: "collapse" as const },
  thead:       { borderBottom: "1.5px solid #F0EEEA", background: "#FAFAF8" },
  th:          { padding: "10px 14px", textAlign: "left" as const, fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".06em", color: "#999", whiteSpace: "nowrap" as const },
  tr:          { borderBottom: "1px solid #F8F7F5" },
  td:          { padding: "11px 14px", fontSize: 13, color: "#333" },
  pagination:  { display: "flex", justifyContent: "center", alignItems: "center", gap: 16, marginTop: 20 },
  pageBtn:     { padding: "8px 18px", background: "#fff", border: "1.5px solid #E2E0DC", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#444" },
};
