"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import AdminHeader from "@/components/admin/AdminHeader";

interface Stats {
  totalPatients: number; totalDoctors: number; todayVisits: number;
  waitingCount: number; inConsultation: number; completedToday: number;
  availableDoctors: number;
}

interface QueueVisit {
  id: string; token: string; visitId: string; status: string;
  patient: { prn: string; name: string; priority: string };
  doctor?: { user: { name: string } };
  queue?: { queuePosition: number };
}

interface FutureAppointment {
  id: string; token: string; visitId: string; appointmentDate: string; healthIssue?: string; status: string;
  patient: { prn: string; name: string; priority: string; phone?: string };
  doctor?: { user: { name: string } };
}

const STATUS_COLOR: Record<string, string> = {
  WAITING: "#D97706", ASSIGNED: "#2563EB", IN_CONSULTATION: "#059669",
  COMPLETED: "#6B7280", CANCELLED: "#DC2626",
};

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats]   = useState<Stats | null>(null);
  const [queue, setQueue]   = useState<QueueVisit[]>([]);
  const [appointments, setAppointments] = useState<FutureAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cancelModal, setCancelModal] = useState<QueueVisit | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const load = async () => {
    const [s, q, a] = await Promise.all([
      fetch("/api/admin/stats").then(r => { if (r.status === 403) router.push("/login"); return r.json(); }),
      fetch("/api/queue").then(r => r.json()),
      fetch("/api/admin/appointments").then(r => r.json()),
    ]);
    setStats(s);
    setQueue(q.visits ?? []);
    setAppointments(a.appointments ?? []);
  };

  useEffect(() => {
    load().catch(() => toast.error("Failed to load")).finally(() => setLoading(false));

    const es = new EventSource("/api/sse");
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        if (["queue:updated","visit:cancelled","doctor:status","patient:called","patient:registered","appointment:booked"].includes(event.type)) load();
      } catch { /* ignore */ }
    };
    return () => es.close();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancelVisit = async () => {
    if (!cancelModal) return;
    setCancelling(cancelModal.id);
    try {
      const res = await fetch(`/api/admin/visits/${cancelModal.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason || "Cancelled by admin" }),
      });
      if (res.ok) { toast.success("Visit cancelled"); setCancelModal(null); setCancelReason(""); await load(); }
      else { const d = await res.json(); toast.error(d.error ?? "Failed"); }
    } finally { setCancelling(null); }
  };

  const activeQueue = queue.filter(v => !["COMPLETED","CANCELLED","SCHEDULED"].includes(v.status));

  return (
    <div style={S.page}>
      <AdminHeader />

      <main style={S.main}>
        {loading ? (
          <div style={S.loadingText}>Loading…</div>
        ) : (
          <>
            <h1 style={S.pageTitle}>Today&apos;s Overview</h1>

            {stats && (
              <div style={S.statsGrid}>
                {[
                  { label: "Total Patients",    value: stats.totalPatients,    icon: "👥" },
                  { label: "Approved Doctors",  value: stats.totalDoctors,     icon: "👨‍⚕️" },
                  { label: "Available Doctors", value: stats.availableDoctors, icon: "✅" },
                  { label: "Today's Visits",    value: stats.todayVisits,      icon: "📋" },
                  { label: "Waiting",           value: stats.waitingCount,     icon: "⏳" },
                  { label: "In Consultation",   value: stats.inConsultation,   icon: "🩺" },
                  { label: "Completed Today",   value: stats.completedToday,   icon: "✔️" },
                ].map(({ label, value, icon }) => (
                  <div key={label} style={S.statCard}>
                    <div style={S.statIcon}>{icon}</div>
                    <div style={S.statNum}>{value}</div>
                    <div style={S.statLabel}>{label}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={S.actionRow}>
              <button style={S.actionBtn} onClick={() => router.push("/walk-in")}>+ Register Walk-In Patient</button>
            </div>

            <div style={S.section}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={S.sectionTitle}>Today&apos;s Live Queue ({activeQueue.length} active)</div>
              </div>
              {activeQueue.length === 0 ? (
                <div style={S.emptyQueue}>No active visits right now.</div>
              ) : (
                <div style={S.tableWrap}>
                  <table style={S.table}>
                    <thead>
                      <tr>
                        {["Token", "Patient", "PRN", "Doctor", "Status", "Pos", "Action"].map(h => (
                          <th key={h} style={S.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeQueue.map(v => (
                        <tr key={v.id} style={S.tr}>
                          <td style={{ ...S.td, fontWeight: 800, fontSize: 16 }}>{v.token}</td>
                          <td style={S.td}>{v.patient.name}</td>
                          <td style={{ ...S.td, color: "#888", fontSize: 12 }}>{v.patient.prn}</td>
                          <td style={S.td}>{v.doctor?.user.name ?? <span style={{ color: "#aaa" }}>Unassigned</span>}</td>
                          <td style={S.td}>
                            <span style={{ ...S.statusPill, background: (STATUS_COLOR[v.status] ?? "#888") + "22", color: STATUS_COLOR[v.status] ?? "#888" }}>
                              {v.status.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td style={{ ...S.td, textAlign: "center" }}>{v.queue?.queuePosition ?? "—"}</td>
                          <td style={S.td}>
                            <button
                              style={S.cancelBtn}
                              onClick={() => { setCancelModal(v); setCancelReason(""); }}
                              disabled={cancelling === v.id}
                            >
                              Cancel
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div style={{ ...S.section, marginTop: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={S.sectionTitle}>Future Appointments ({appointments.length})</div>
              </div>
              {appointments.length === 0 ? (
                <div style={S.emptyQueue}>No upcoming appointments scheduled.</div>
              ) : (
                <div style={S.tableWrap}>
                  <table style={S.table}>
                    <thead>
                      <tr>
                        {["Token", "Patient", "PRN", "Appointment Date", "Reason", "Doctor"].map(h => (
                          <th key={h} style={S.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {appointments.map(a => (
                        <tr key={a.id} style={S.tr}>
                          <td style={{ ...S.td, fontWeight: 800, fontSize: 16 }}>{a.token}</td>
                          <td style={S.td}>{a.patient.name}</td>
                          <td style={{ ...S.td, color: "#888", fontSize: 12 }}>{a.patient.prn}</td>
                          <td style={{ ...S.td, fontWeight: 700, color: "#2563EB" }}>
                            {new Date(a.appointmentDate).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                          </td>
                          <td style={{ ...S.td, color: "#555", fontSize: 13 }}>{a.healthIssue ?? <span style={{ color: "#ccc" }}>—</span>}</td>
                          <td style={S.td}>{a.doctor?.user.name ?? <span style={{ color: "#aaa" }}>Unassigned</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {cancelModal && (
        <div style={S.modalOverlay} onClick={() => setCancelModal(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <h3 style={S.modalTitle}>Cancel Visit</h3>
            <p style={S.modalSub}>Cancel token <strong>{cancelModal.token}</strong> for <strong>{cancelModal.patient.name}</strong>?</p>
            <div style={{ marginBottom: 16 }}>
              <label style={S.fieldLabel}>Reason (optional)</label>
              <input style={S.input} value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="Reason for cancellation…" />
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button style={S.modalCancelBtn} onClick={() => setCancelModal(null)}>Keep Visit</button>
              <button style={S.modalConfirmBtn} onClick={cancelVisit} disabled={!!cancelling}>
                {cancelling ? "Cancelling…" : "Yes, Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page:           { minHeight: "100vh", background: "#F5F4F2", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif" },
  main:           { maxWidth: 1280, margin: "0 auto", padding: "32px 24px" },
  loadingText:    { padding: "60px 0", textAlign: "center" as const, color: "#aaa" },
  pageTitle:      { fontSize: 22, fontWeight: 700, color: "#0C1929", marginBottom: 24 },
  statsGrid:      { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 12, marginBottom: 24 },
  statCard:       { background: "#fff", borderRadius: 12, padding: "16px 14px", boxShadow: "0 1px 4px rgba(0,0,0,.05)", border: "1.5px solid #E8E6E3", textAlign: "center" as const },
  statIcon:       { fontSize: 20, marginBottom: 6 },
  statNum:        { fontSize: 26, fontWeight: 800, color: "#0C1929", lineHeight: 1, marginBottom: 4 },
  statLabel:      { fontSize: 11, color: "#888", fontWeight: 600, lineHeight: 1.3 },
  actionRow:      { display: "flex", gap: 10, marginBottom: 24 },
  actionBtn:      { padding: "10px 20px", background: "#0C1929", color: "#fff", borderRadius: 9, fontSize: 13.5, fontWeight: 600, border: "none", cursor: "pointer" },
  section:        { background: "#fff", borderRadius: 14, padding: "24px", boxShadow: "0 1px 6px rgba(0,0,0,.05)" },
  sectionTitle:   { fontSize: 15, fontWeight: 700, color: "#0C1929" },
  emptyQueue:     { fontSize: 14, color: "#aaa", textAlign: "center" as const, padding: "40px 0" },
  tableWrap:      { overflowX: "auto" as const },
  table:          { width: "100%", borderCollapse: "collapse" as const },
  th:             { fontSize: 11, fontWeight: 700, color: "#999", letterSpacing: ".07em", textTransform: "uppercase" as const, padding: "8px 12px", textAlign: "left" as const, borderBottom: "1px solid #E8E6E3" },
  tr:             { borderBottom: "1px solid #F0EEEB" },
  td:             { padding: "12px 12px", fontSize: 13.5, color: "#333" },
  statusPill:     { fontSize: 11.5, fontWeight: 700, padding: "3px 10px", borderRadius: 12 },
  cancelBtn:      { padding: "5px 12px", background: "#FEE2E2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer" },
  modalOverlay:   { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 },
  modal:          { background: "#fff", borderRadius: 16, padding: "28px 32px", width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,.18)" },
  modalTitle:     { fontSize: 17, fontWeight: 700, color: "#0C1929", marginBottom: 8 },
  modalSub:       { fontSize: 13.5, color: "#555", marginBottom: 20, lineHeight: 1.5 },
  fieldLabel:     { display: "block", fontSize: 11, fontWeight: 700, color: "#666", letterSpacing: ".07em", textTransform: "uppercase" as const, marginBottom: 6 },
  input:          { width: "100%", padding: "10px 14px", border: "1.5px solid #E2E0DC", borderRadius: 9, fontSize: 14, outline: "none", boxSizing: "border-box" as const },
  modalCancelBtn: { padding: "10px 18px", background: "transparent", color: "#555", border: "1.5px solid #D0CEC9", borderRadius: 9, fontSize: 13.5, fontWeight: 600, cursor: "pointer" },
  modalConfirmBtn:{ padding: "10px 18px", background: "#DC2626", color: "#fff", border: "none", borderRadius: 9, fontSize: 13.5, fontWeight: 600, cursor: "pointer" },
};
