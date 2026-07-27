"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

interface DashboardData {
  patient:      { prn: string; name: string; gender?: string; phone?: string };
  todayVisit:   { token: string; visitId: string; status: string; doctor?: { user: { name: string } } } | null;
  queueAhead:   number;
  estimatedWait: number;
}

interface HistoryItem {
  id: string;
  prescription?: string;
  healthNotes?: string;
  consultationStart: string;
  consultationEnd?: string;
  duration?: number;
  doctor: { user: { name: string } };
  visit:  { token: string; visitId: string; visitDate: string };
}

const STATUS_LABEL: Record<string, string> = {
  WAITING: "Waiting", ASSIGNED: "Assigned to Doctor",
  IN_CONSULTATION: "In Consultation", COMPLETED: "Completed", CANCELLED: "Cancelled",
};
const STATUS_COLOR: Record<string, string> = {
  WAITING: "#D97706", ASSIGNED: "#2563EB", IN_CONSULTATION: "#059669",
  COMPLETED: "#6B7280", CANCELLED: "#DC2626",
};

export default function PatientDashboard() {
  const router = useRouter();
  const [data, setData]       = useState<DashboardData | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<"today" | "history">("today");

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  useEffect(() => {
    Promise.all([
      fetch("/api/patient/dashboard").then(r => { if (r.status === 403) { router.push("/login"); } return r.json(); }),
      fetch("/api/patient/history").then(r => r.json()),
    ]).then(([d, h]) => {
      setData(d);
      setHistory(h.histories ?? []);
    }).catch(() => toast.error("Failed to load dashboard")).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={S.loading}>Loading…</div>;
  if (!data?.patient) return <div style={S.loading}>Patient profile not found.</div>;

  const { patient, todayVisit, queueAhead, estimatedWait } = data;

  return (
    <div style={S.page}>
      {/* Header */}
      <header style={S.header}>
        <div style={S.headerInner}>
          <div style={S.brand}>
            <img src="/waferlogo.png" alt="Wafer" style={S.logo} />
            <span style={S.brandName}>Patient Portal</span>
          </div>
          <div style={S.headerRight}>
            <span style={S.prnBadge}>{patient.prn}</span>
            <button style={S.logoutBtn} onClick={logout}>Sign Out</button>
          </div>
        </div>
      </header>

      <main style={S.main}>
        {/* Welcome */}
        <div style={S.welcome}>
          <h1 style={S.welcomeH}>Welcome, {patient.name}</h1>
          <p style={S.welcomeSub}>Your permanent reference number: <strong>{patient.prn}</strong></p>
        </div>

        {/* Tabs */}
        <div style={S.tabs}>
          <button style={{ ...S.tab, ...(tab === "today" ? S.tabActive : {}) }} onClick={() => setTab("today")}>Today's Visit</button>
          <button style={{ ...S.tab, ...(tab === "history" ? S.tabActive : {}) }} onClick={() => setTab("history")}>Consultation History</button>
        </div>

        {/* Today tab */}
        {tab === "today" && (
          <div>
            {todayVisit ? (
              <div style={S.visitCard}>
                <div style={S.visitHeader}>
                  <div>
                    <div style={S.tokenBig}>{todayVisit.token}</div>
                    <div style={S.tokenSub}>Your Queue Token</div>
                  </div>
                  <span style={{ ...S.statusPill, background: STATUS_COLOR[todayVisit.status] + "22", color: STATUS_COLOR[todayVisit.status] }}>
                    {STATUS_LABEL[todayVisit.status] ?? todayVisit.status}
                  </span>
                </div>

                <div style={S.infoGrid}>
                  <div style={S.infoItem}>
                    <span style={S.infoLabel}>Visit ID</span>
                    <span style={S.infoVal}>{todayVisit.visitId}</span>
                  </div>
                  {todayVisit.doctor && (
                    <div style={S.infoItem}>
                      <span style={S.infoLabel}>Assigned Doctor</span>
                      <span style={S.infoVal}>{todayVisit.doctor.user.name}</span>
                    </div>
                  )}
                  {todayVisit.status !== "COMPLETED" && todayVisit.status !== "CANCELLED" && (
                    <>
                      <div style={S.infoItem}>
                        <span style={S.infoLabel}>Patients Ahead</span>
                        <span style={S.infoVal}>{queueAhead}</span>
                      </div>
                      <div style={S.infoItem}>
                        <span style={S.infoLabel}>Estimated Wait</span>
                        <span style={S.infoVal}>{estimatedWait} min</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div style={S.emptyCard}>
                <div style={S.emptyIcon}>📋</div>
                <div style={S.emptyText}>No visit registered for today.</div>
                <div style={S.emptySubText}>Visit the reception desk to get a queue token.</div>
              </div>
            )}
          </div>
        )}

        {/* History tab */}
        {tab === "history" && (
          <div>
            {history.length === 0 ? (
              <div style={S.emptyCard}>
                <div style={S.emptyIcon}>📂</div>
                <div style={S.emptyText}>No consultation history yet.</div>
              </div>
            ) : (
              <div style={S.historyList}>
                {history.map(h => (
                  <div key={h.id} style={S.historyCard}>
                    <div style={S.historyHeader}>
                      <div>
                        <span style={S.historyToken}>{h.visit.token}</span>
                        <span style={S.historyDate}>{new Date(h.visit.visitDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                      </div>
                      <span style={S.historyDoctor}>{h.doctor.user.name}</span>
                    </div>
                    {h.healthNotes && (
                      <div style={S.historySection}>
                        <div style={S.sectionLabel}>Health Notes</div>
                        <div style={S.sectionText}>{h.healthNotes}</div>
                      </div>
                    )}
                    {h.prescription && (
                      <div style={S.historySection}>
                        <div style={S.sectionLabel}>Prescription</div>
                        <div style={S.sectionText}>{h.prescription}</div>
                      </div>
                    )}
                    {h.duration && (
                      <div style={S.historyFooter}>Duration: {Math.round(h.duration / 60)} min</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  loading:      { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui,sans-serif", color: "#888" },
  page:         { minHeight: "100vh", background: "#F5F4F2", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif" },
  header:       { background: "#0C1929", padding: "0 24px", height: 60 },
  headerInner:  { maxWidth: 900, margin: "0 auto", height: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" },
  brand:        { display: "flex", alignItems: "center", gap: 10 },
  logo:         { height: 28, filter: "brightness(0) invert(1)" },
  brandName:    { fontSize: 15, fontWeight: 700, color: "#fff" },
  headerRight:  { display: "flex", alignItems: "center", gap: 12 },
  prnBadge:     { fontSize: 12, fontWeight: 700, background: "rgba(255,255,255,.12)", color: "#fff", padding: "4px 12px", borderRadius: 20, letterSpacing: ".05em" },
  logoutBtn:    { fontSize: 13, color: "rgba(255,255,255,.7)", background: "transparent", border: "1px solid rgba(255,255,255,.25)", borderRadius: 8, padding: "5px 14px", cursor: "pointer" },
  main:         { maxWidth: 900, margin: "0 auto", padding: "32px 24px" },
  welcome:      { marginBottom: 28 },
  welcomeH:     { fontSize: 26, fontWeight: 700, color: "#0C1929", marginBottom: 4 },
  welcomeSub:   { fontSize: 14, color: "#666" },
  tabs:         { display: "flex", gap: 4, marginBottom: 24, background: "#E8E6E3", borderRadius: 12, padding: 4 },
  tab:          { flex: 1, padding: "9px 16px", background: "transparent", border: "none", borderRadius: 9, fontSize: 13.5, fontWeight: 600, color: "#666", cursor: "pointer" },
  tabActive:    { background: "#fff", color: "#0C1929", boxShadow: "0 1px 4px rgba(0,0,0,.1)" },
  visitCard:    { background: "#fff", borderRadius: 14, padding: "28px 32px", boxShadow: "0 1px 8px rgba(0,0,0,.06)" },
  visitHeader:  { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 },
  tokenBig:     { fontSize: 56, fontWeight: 800, color: "#0C1929", lineHeight: 1 },
  tokenSub:     { fontSize: 12, color: "#999", marginTop: 4, letterSpacing: ".05em", textTransform: "uppercase" },
  statusPill:   { fontSize: 12.5, fontWeight: 700, padding: "5px 14px", borderRadius: 20, letterSpacing: ".03em" },
  infoGrid:     { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  infoItem:     { background: "#F8F7F5", borderRadius: 10, padding: "14px 16px" },
  infoLabel:    { display: "block", fontSize: 11, fontWeight: 700, color: "#999", letterSpacing: ".07em", textTransform: "uppercase", marginBottom: 4 },
  infoVal:      { fontSize: 16, fontWeight: 700, color: "#0C1929" },
  emptyCard:    { background: "#fff", borderRadius: 14, padding: "56px 32px", textAlign: "center", boxShadow: "0 1px 8px rgba(0,0,0,.06)" },
  emptyIcon:    { fontSize: 36, marginBottom: 12 },
  emptyText:    { fontSize: 16, fontWeight: 600, color: "#444", marginBottom: 6 },
  emptySubText: { fontSize: 13.5, color: "#999" },
  historyList:  { display: "flex", flexDirection: "column", gap: 14 },
  historyCard:  { background: "#fff", borderRadius: 12, padding: "20px 24px", boxShadow: "0 1px 6px rgba(0,0,0,.05)" },
  historyHeader:{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  historyToken: { fontSize: 18, fontWeight: 800, color: "#0C1929", marginRight: 10 },
  historyDate:  { fontSize: 13, color: "#888" },
  historyDoctor:{ fontSize: 13, fontWeight: 600, color: "#2563EB" },
  historySection:{ marginBottom: 10 },
  sectionLabel: { fontSize: 11, fontWeight: 700, color: "#999", letterSpacing: ".07em", textTransform: "uppercase", marginBottom: 4 },
  sectionText:  { fontSize: 13.5, color: "#333", lineHeight: 1.5 },
  historyFooter:{ fontSize: 12, color: "#aaa", marginTop: 8 },
};
