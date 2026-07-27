"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";

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

const STATUS_COLOR: Record<string, string> = {
  WAITING: "#D97706", ASSIGNED: "#2563EB", IN_CONSULTATION: "#059669",
  COMPLETED: "#6B7280", CANCELLED: "#DC2626",
};

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats]   = useState<Stats | null>(null);
  const [queue, setQueue]   = useState<QueueVisit[]>([]);
  const [loading, setLoading] = useState(true);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/stats").then(r => { if (r.status === 403) router.push("/login"); return r.json(); }),
      fetch("/api/queue").then(r => r.json()),
    ]).then(([s, q]) => {
      setStats(s);
      setQueue(q.visits ?? []);
    }).catch(() => toast.error("Failed to load")).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={S.loading}>Loading…</div>;

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div style={S.headerInner}>
          <div style={S.brand}>
            <img src="/waferlogo.png" alt="Wafer" style={S.logo} />
            <span style={S.brandName}>Admin Dashboard</span>
          </div>
          <div style={S.headerRight}>
            <Link href="/admin/patients" style={S.navLink}>Patients</Link>
            <Link href="/admin/doctors"  style={S.navLink}>Doctors</Link>
            <Link href="/walk-in"        style={S.navLink}>Walk-In</Link>
            <button style={S.logoutBtn} onClick={logout}>Sign Out</button>
          </div>
        </div>
      </header>

      <main style={S.main}>
        <h1 style={S.pageTitle}>Today's Overview</h1>

        {/* Stats */}
        {stats && (
          <div style={S.statsGrid}>
            {[
              { label: "Total Patients",     value: stats.totalPatients,    icon: "👥" },
              { label: "Approved Doctors",   value: stats.totalDoctors,     icon: "👨‍⚕️" },
              { label: "Available Doctors",  value: stats.availableDoctors, icon: "✅" },
              { label: "Today's Visits",     value: stats.todayVisits,      icon: "📋" },
              { label: "Waiting",            value: stats.waitingCount,     icon: "⏳" },
              { label: "In Consultation",    value: stats.inConsultation,   icon: "🩺" },
              { label: "Completed Today",    value: stats.completedToday,   icon: "✔️" },
            ].map(({ label, value, icon }) => (
              <div key={label} style={S.statCard}>
                <div style={S.statIcon}>{icon}</div>
                <div style={S.statNum}>{value}</div>
                <div style={S.statLabel}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Quick actions */}
        <div style={S.actionRow}>
          <Link href="/walk-in" style={S.actionBtn}>+ Register Walk-In Patient</Link>
          <Link href="/admin/patients" style={{ ...S.actionBtn, background: "transparent", color: "#0C1929", border: "1.5px solid #0C1929" }}>Manage Patients</Link>
          <Link href="/admin/doctors"  style={{ ...S.actionBtn, background: "transparent", color: "#0C1929", border: "1.5px solid #0C1929" }}>Manage Doctors</Link>
        </div>

        {/* Live Queue */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Live Queue</div>
          {queue.length === 0 ? (
            <div style={S.emptyQueue}>No visits today yet.</div>
          ) : (
            <div style={S.tableWrap}>
              <table style={S.table}>
                <thead>
                  <tr>
                    {["Token", "Patient", "PRN", "Doctor", "Status", "Position"].map(h => (
                      <th key={h} style={S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {queue.map(v => (
                    <tr key={v.id} style={S.tr}>
                      <td style={{ ...S.td, fontWeight: 800, fontSize: 16 }}>{v.token}</td>
                      <td style={S.td}>{v.patient.name}</td>
                      <td style={{ ...S.td, color: "#888", fontSize: 12 }}>{v.patient.prn}</td>
                      <td style={S.td}>{v.doctor?.user.name ?? <span style={{ color: "#aaa" }}>Unassigned</span>}</td>
                      <td style={S.td}>
                        <span style={{ ...S.statusPill, background: (STATUS_COLOR[v.status] ?? "#888") + "22", color: STATUS_COLOR[v.status] ?? "#888" }}>
                          {v.status.replace("_", " ")}
                        </span>
                      </td>
                      <td style={{ ...S.td, textAlign: "center" }}>{v.queue?.queuePosition ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  loading:     { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui,sans-serif", color: "#888" },
  page:        { minHeight: "100vh", background: "#F5F4F2", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif" },
  header:      { background: "#0C1929", padding: "0 24px" },
  headerInner: { maxWidth: 1200, margin: "0 auto", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" },
  brand:       { display: "flex", alignItems: "center", gap: 10 },
  logo:        { height: 28, filter: "brightness(0) invert(1)" },
  brandName:   { fontSize: 15, fontWeight: 700, color: "#fff" },
  headerRight: { display: "flex", alignItems: "center", gap: 12 },
  navLink:     { fontSize: 13.5, color: "rgba(255,255,255,.75)", textDecoration: "none", fontWeight: 500 },
  logoutBtn:   { fontSize: 12.5, color: "rgba(255,255,255,.6)", background: "transparent", border: "1px solid rgba(255,255,255,.2)", borderRadius: 8, padding: "5px 12px", cursor: "pointer" },
  main:        { maxWidth: 1200, margin: "0 auto", padding: "32px 24px" },
  pageTitle:   { fontSize: 22, fontWeight: 700, color: "#0C1929", marginBottom: 24 },
  statsGrid:   { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 12, marginBottom: 24 },
  statCard:    { background: "#fff", borderRadius: 12, padding: "16px 14px", boxShadow: "0 1px 4px rgba(0,0,0,.05)", border: "1.5px solid #E8E6E3", textAlign: "center" },
  statIcon:    { fontSize: 20, marginBottom: 6 },
  statNum:     { fontSize: 26, fontWeight: 800, color: "#0C1929", lineHeight: 1, marginBottom: 4 },
  statLabel:   { fontSize: 11, color: "#888", fontWeight: 600, lineHeight: 1.3 },
  actionRow:   { display: "flex", gap: 10, marginBottom: 28 },
  actionBtn:   { padding: "10px 20px", background: "#0C1929", color: "#fff", borderRadius: 9, fontSize: 13.5, fontWeight: 600, textDecoration: "none", border: "none", cursor: "pointer" },
  section:     { background: "#fff", borderRadius: 14, padding: "24px", boxShadow: "0 1px 6px rgba(0,0,0,.05)" },
  sectionTitle:{ fontSize: 15, fontWeight: 700, color: "#0C1929", marginBottom: 16 },
  emptyQueue:  { fontSize: 14, color: "#aaa", textAlign: "center", padding: "40px 0" },
  tableWrap:   { overflowX: "auto" },
  table:       { width: "100%", borderCollapse: "collapse" },
  th:          { fontSize: 11, fontWeight: 700, color: "#999", letterSpacing: ".07em", textTransform: "uppercase", padding: "8px 12px", textAlign: "left", borderBottom: "1px solid #E8E6E3" },
  tr:          { borderBottom: "1px solid #F0EEEB" },
  td:          { padding: "12px 12px", fontSize: 13.5, color: "#333" },
  statusPill:  { fontSize: 11.5, fontWeight: 700, padding: "3px 10px", borderRadius: 12 },
};
