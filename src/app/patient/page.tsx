"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

interface DashboardData {
  patient:               { id: string; prn: string; name: string; gender?: string; phone?: string };
  todayVisit:            { id: string; token: string; visitId: string; status: string; doctor?: { user: { name: string } } } | null;
  queueAhead:            number;
  estimatedWait:         number;
  upcomingAppointments:  { id: string; visitId: string; appointmentDate: string; healthIssue?: string; status: string }[];
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
  SCHEDULED: "Scheduled", WAITING: "Waiting", ASSIGNED: "Assigned to Doctor",
  IN_CONSULTATION: "In Consultation", COMPLETED: "Completed", CANCELLED: "Cancelled",
};
const STATUS_COLOR: Record<string, string> = {
  SCHEDULED: "#7C3AED", WAITING: "#D97706", ASSIGNED: "#2563EB",
  IN_CONSULTATION: "#059669", COMPLETED: "#6B7280", CANCELLED: "#DC2626",
};

export default function PatientDashboard() {
  const router = useRouter();
  const [data, setData]           = useState<DashboardData | null>(null);
  const [history, setHistory]     = useState<HistoryItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [joining, setJoining]     = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState<string | null>(null);
  const [tab, setTab]             = useState<"today" | "appointments" | "history">("today");
  const [healthIssue, setHealthIssue] = useState("");

  // Appointment booking form
  const [showApptForm, setShowApptForm] = useState(false);
  const [apptDate,     setApptDate]     = useState("");
  const [apptIssue,    setApptIssue]    = useState("");
  const [booking,      setBooking]      = useState(false);

  const patientIdRef    = useRef<string | null>(null);
  const selfCancelRef   = useRef(false);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const loadDashboard = async () => {
    const [d, h] = await Promise.all([
      fetch("/api/patient/dashboard").then(r => { if (r.status === 401 || r.status === 403) router.push("/login"); return r.json(); }),
      fetch("/api/patient/history").then(r => r.json()),
    ]);
    setData(d);
    setHistory(h.histories ?? []);
    if (d.patient?.id) patientIdRef.current = d.patient.id;
  };

  // SSE connection
  useEffect(() => {
    let es: EventSource | null = null;
    const connectSSE = (patientId: string) => {
      es = new EventSource(`/api/sse?patientId=${patientId}`);
      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          if (event.type === "queue:updated" || event.type === "patient:called" || event.type === "visit:cancelled" || event.type === "appointment:booked") {
            loadDashboard();
            if (event.type === "patient:called") toast.success(`Your turn! Token ${event.token}`);
            if (event.type === "visit:cancelled" && !selfCancelRef.current) toast.error("Your visit was cancelled by admin");
          }
        } catch { /* ignore parse errors */ }
      };
      es.onerror = () => { es?.close(); setTimeout(() => { if (patientIdRef.current) connectSSE(patientIdRef.current); }, 5000); };
    };

    loadDashboard()
      .then(() => { if (patientIdRef.current) connectSSE(patientIdRef.current); })
      .catch(() => toast.error("Failed to load dashboard"))
      .finally(() => setLoading(false));

    return () => es?.close();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const joinQueue = async () => {
    setJoining(true);
    try {
      const res = await fetch("/api/patient/join-queue", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ healthIssue: healthIssue.trim() || undefined }),
      });
      const d = await res.json();
      if (res.status === 409) { toast.error(d.error); return; }
      if (!res.ok) { toast.error(d.error ?? "Failed to join queue"); return; }
      toast.success(`Joined queue — Token: ${d.visit.token}`);
      setHealthIssue("");
      await loadDashboard();
    } finally { setJoining(false); }
  };

  const cancelVisit = async (visitId: string) => {
    setCancelling(visitId);
    selfCancelRef.current = true;
    try {
      const res = await fetch(`/api/patient/visits/${visitId}`, { method: "PATCH" });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error ?? "Failed to cancel"); return; }
      toast.success("Visit cancelled successfully");
      setCancelConfirm(null);
      await loadDashboard();
    } finally {
      setCancelling(null);
      setTimeout(() => { selfCancelRef.current = false; }, 2000);
    }
  };

  const bookAppointment = async () => {
    if (!apptDate) { toast.error("Select an appointment date"); return; }
    setBooking(true);
    try {
      const res = await fetch("/api/patient/appointments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentDate: apptDate, healthIssue: apptIssue.trim() || undefined }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error ?? "Failed to book appointment"); return; }
      toast.success("Appointment booked successfully!");
      setShowApptForm(false); setApptDate(""); setApptIssue("");
      await loadDashboard();
    } finally { setBooking(false); }
  };

  if (loading) return <div style={S.loading}>Loading…</div>;
  if (!data?.patient) return <div style={S.loading}>Patient profile not found.</div>;

  const { patient, todayVisit, queueAhead, estimatedWait, upcomingAppointments } = data;
  const minApptDate = new Date(); minApptDate.setDate(minApptDate.getDate() + 1);
  const minDateStr = minApptDate.toISOString().split("T")[0];

  return (
    <div style={S.page}>
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
        <div style={S.welcome}>
          <h1 style={S.welcomeH}>Welcome, {patient.name}</h1>
          <p style={S.welcomeSub}>PRN: <strong>{patient.prn}</strong></p>
        </div>

        <div style={S.tabs}>
          <button style={{ ...S.tab, ...(tab === "today"        ? S.tabActive : {}) }} onClick={() => setTab("today")}>Today&apos;s Visit</button>
          <button style={{ ...S.tab, ...(tab === "appointments" ? S.tabActive : {}) }} onClick={() => setTab("appointments")}>
            Appointments {upcomingAppointments?.length > 0 && <span style={S.badge}>{upcomingAppointments.length}</span>}
          </button>
          <button style={{ ...S.tab, ...(tab === "history"      ? S.tabActive : {}) }} onClick={() => setTab("history")}>Consultation History</button>
        </div>

        {/* ── Today tab ─────────────────────────────────────────────────── */}
        {tab === "today" && (
          <div>
            {todayVisit ? (
              <div style={S.visitCard}>
                <div style={S.visitHeader}>
                  <div>
                    <div style={S.tokenBig}>{todayVisit.token}</div>
                    <div style={S.tokenSub}>Your Queue Token</div>
                  </div>
                  <span style={{ ...S.statusPill, background: (STATUS_COLOR[todayVisit.status] ?? "#888") + "22", color: STATUS_COLOR[todayVisit.status] ?? "#888" }}>
                    {STATUS_LABEL[todayVisit.status] ?? todayVisit.status}
                  </span>
                </div>
                <div style={S.infoGrid}>
                  <div style={S.infoItem}><span style={S.infoLabel}>Visit ID</span><span style={S.infoVal}>{todayVisit.visitId}</span></div>
                  {todayVisit.doctor && <div style={S.infoItem}><span style={S.infoLabel}>Assigned Doctor</span><span style={S.infoVal}>{todayVisit.doctor.user.name}</span></div>}
                  {!["COMPLETED","CANCELLED","IN_CONSULTATION"].includes(todayVisit.status) && (
                    <>
                      <div style={S.infoItem}><span style={S.infoLabel}>Patients Ahead</span><span style={S.infoVal}>{queueAhead}</span></div>
                      <div style={S.infoItem}><span style={S.infoLabel}>Estimated Wait</span><span style={S.infoVal}>{estimatedWait} min</span></div>
                    </>
                  )}
                </div>
                {["WAITING","ASSIGNED"].includes(todayVisit.status) && (
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #F0EEEB" }}>
                    {cancelConfirm === todayVisit.id ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 13.5, color: "#555" }}>Cancel your visit today?</span>
                        <button style={S.cancelDangerBtn} onClick={() => cancelVisit(todayVisit.id)} disabled={cancelling === todayVisit.id}>
                          {cancelling === todayVisit.id ? "Cancelling…" : "Yes, Cancel"}
                        </button>
                        <button style={S.cancelGhostBtn} onClick={() => setCancelConfirm(null)}>Keep</button>
                      </div>
                    ) : (
                      <button style={S.cancelOutlineBtn} onClick={() => setCancelConfirm(todayVisit.id)}>Cancel My Visit</button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div style={S.emptyCard}>
                <div style={S.emptyIcon}>📋</div>
                <div style={S.emptyText}>No visit registered for today.</div>
                <div style={S.emptySubText}>Join the walk-in queue or book a future appointment.</div>
                <div style={{ maxWidth: 400, margin: "0 auto 16px" }}>
                  <label style={{ ...S.fieldLabel, textAlign: "left", display: "block", marginBottom: 6 }}>Chief Complaint <span style={{ color: "#aaa", fontWeight: 400 }}>(optional)</span></label>
                  <textarea
                    style={{ ...S.textarea, marginBottom: 12 }}
                    placeholder="Describe your symptoms or reason for visit…"
                    value={healthIssue}
                    onChange={e => setHealthIssue(e.target.value)}
                    rows={2}
                  />
                </div>
                <button style={S.joinBtn} onClick={joinQueue} disabled={joining}>
                  {joining ? "Joining…" : "Join Today's Queue"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Appointments tab ───────────────────────────────────────────── */}
        {tab === "appointments" && (
          <div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
              <button style={S.joinBtn} onClick={() => setShowApptForm(v => !v)}>
                {showApptForm ? "Cancel" : "+ Book Appointment"}
              </button>
            </div>

            {showApptForm && (
              <div style={{ ...S.visitCard, marginBottom: 20 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0C1929", marginBottom: 16 }}>Book a Future Appointment</h3>
                <div style={S.apptForm}>
                  <div>
                    <label style={S.fieldLabel}>Appointment Date *</label>
                    <input type="date" style={S.input} min={minDateStr} value={apptDate} onChange={e => setApptDate(e.target.value)} />
                  </div>
                  <div>
                    <label style={S.fieldLabel}>Reason / Health Issue <span style={{ color: "#aaa", fontWeight: 400 }}>(optional)</span></label>
                    <input style={S.input} value={apptIssue} onChange={e => setApptIssue(e.target.value)} placeholder="e.g. Follow-up, Fever…" />
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                  <button style={S.joinBtn} onClick={bookAppointment} disabled={booking}>
                    {booking ? "Booking…" : "Confirm Appointment"}
                  </button>
                </div>
              </div>
            )}

            {(!upcomingAppointments || upcomingAppointments.length === 0) && !showApptForm && (
              <div style={S.emptyCard}>
                <div style={S.emptyIcon}>📅</div>
                <div style={S.emptyText}>No upcoming appointments.</div>
                <div style={S.emptySubText}>Book an appointment for a future date.</div>
              </div>
            )}

            {upcomingAppointments?.map(appt => (
              <div key={appt.id} style={{ ...S.historyCard, marginBottom: 12 }}>
                <div style={S.historyHeader}>
                  <div>
                    <span style={S.historyToken}>{appt.visitId}</span>
                    <span style={S.historyDate}>{new Date(appt.appointmentDate).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
                  </div>
                  <span style={{ ...S.statusPill, background: (STATUS_COLOR[appt.status] ?? "#888") + "22", color: STATUS_COLOR[appt.status] ?? "#888" }}>
                    {STATUS_LABEL[appt.status] ?? appt.status}
                  </span>
                </div>
                {appt.healthIssue && <div style={{ ...S.sectionText, marginBottom: 10 }}>{appt.healthIssue}</div>}
                {["SCHEDULED","WAITING","ASSIGNED"].includes(appt.status) && (
                  <div style={{ paddingTop: 10, borderTop: "1px solid #F0EEEB" }}>
                    {cancelConfirm === appt.id ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 13, color: "#555" }}>Cancel this appointment?</span>
                        <button style={S.cancelDangerBtn} onClick={() => cancelVisit(appt.id)} disabled={cancelling === appt.id}>
                          {cancelling === appt.id ? "Cancelling…" : "Yes, Cancel"}
                        </button>
                        <button style={S.cancelGhostBtn} onClick={() => setCancelConfirm(null)}>Keep</button>
                      </div>
                    ) : (
                      <button style={S.cancelOutlineBtn} onClick={() => setCancelConfirm(appt.id)}>Cancel Appointment</button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── History tab ────────────────────────────────────────────────── */}
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
                    {h.healthNotes && <div style={S.historySection}><div style={S.sectionLabel}>Health Notes</div><div style={S.sectionText}>{h.healthNotes}</div></div>}
                    {h.prescription && <div style={S.historySection}><div style={S.sectionLabel}>Prescription</div><div style={S.sectionText}>{h.prescription}</div></div>}
                    {h.duration && <div style={S.historyFooter}>Duration: {Math.round(h.duration / 60)} min</div>}
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
  headerInner:  { maxWidth: 960, margin: "0 auto", height: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" },
  brand:        { display: "flex", alignItems: "center", gap: 10 },
  logo:         { height: 28, filter: "brightness(0) invert(1)" },
  brandName:    { fontSize: 15, fontWeight: 700, color: "#fff" },
  headerRight:  { display: "flex", alignItems: "center", gap: 12 },
  prnBadge:     { fontSize: 12, fontWeight: 700, background: "rgba(255,255,255,.12)", color: "#fff", padding: "4px 12px", borderRadius: 20, letterSpacing: ".05em" },
  logoutBtn:    { fontSize: 13, color: "rgba(255,255,255,.7)", background: "transparent", border: "1px solid rgba(255,255,255,.25)", borderRadius: 8, padding: "5px 14px", cursor: "pointer" },
  main:         { maxWidth: 960, margin: "0 auto", padding: "32px 24px" },
  welcome:      { marginBottom: 28 },
  welcomeH:     { fontSize: 26, fontWeight: 700, color: "#0C1929", marginBottom: 4 },
  welcomeSub:   { fontSize: 14, color: "#666" },
  tabs:         { display: "flex", gap: 4, marginBottom: 24, background: "#E8E6E3", borderRadius: 12, padding: 4 },
  tab:          { flex: 1, padding: "9px 12px", background: "transparent", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 600, color: "#666", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 },
  tabActive:    { background: "#fff", color: "#0C1929", boxShadow: "0 1px 4px rgba(0,0,0,.1)" },
  badge:        { background: "#0C1929", color: "#fff", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10 },
  visitCard:    { background: "#fff", borderRadius: 14, padding: "28px 32px", boxShadow: "0 1px 8px rgba(0,0,0,.06)" },
  visitHeader:  { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 },
  tokenBig:     { fontSize: 56, fontWeight: 800, color: "#0C1929", lineHeight: 1 },
  tokenSub:     { fontSize: 12, color: "#999", marginTop: 4, letterSpacing: ".05em", textTransform: "uppercase" as const },
  statusPill:   { fontSize: 12.5, fontWeight: 700, padding: "5px 14px", borderRadius: 20, letterSpacing: ".03em" },
  infoGrid:     { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  infoItem:     { background: "#F8F7F5", borderRadius: 10, padding: "14px 16px" },
  infoLabel:    { display: "block", fontSize: 11, fontWeight: 700, color: "#999", letterSpacing: ".07em", textTransform: "uppercase" as const, marginBottom: 4 },
  infoVal:      { fontSize: 16, fontWeight: 700, color: "#0C1929" },
  emptyCard:    { background: "#fff", borderRadius: 14, padding: "56px 32px", textAlign: "center" as const, boxShadow: "0 1px 8px rgba(0,0,0,.06)" },
  emptyIcon:    { fontSize: 36, marginBottom: 12 },
  emptyText:    { fontSize: 16, fontWeight: 600, color: "#444", marginBottom: 6 },
  emptySubText: { fontSize: 13.5, color: "#999", marginBottom: 24 },
  joinBtn:      { padding: "11px 28px", background: "#0C1929", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" },
  fieldLabel:   { fontSize: 11, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase" as const, color: "#555", marginBottom: 6 },
  input:        { width: "100%", padding: "10px 14px", border: "1.5px solid #E2E0DC", borderRadius: 9, fontSize: 14, color: "#111", background: "#FDFCFB", outline: "none", boxSizing: "border-box" as const },
  textarea:     { width: "100%", padding: "10px 14px", border: "1.5px solid #E2E0DC", borderRadius: 9, fontSize: 14, color: "#111", background: "#FDFCFB", outline: "none", boxSizing: "border-box" as const, resize: "vertical" as const },
  apptForm:     { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  historyList:  { display: "flex", flexDirection: "column" as const, gap: 14 },
  historyCard:  { background: "#fff", borderRadius: 12, padding: "20px 24px", boxShadow: "0 1px 6px rgba(0,0,0,.05)" },
  historyHeader:{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  historyToken: { fontSize: 18, fontWeight: 800, color: "#0C1929", marginRight: 10 },
  historyDate:  { fontSize: 13, color: "#888" },
  historyDoctor:{ fontSize: 13, fontWeight: 600, color: "#2563EB" },
  historySection:{ marginBottom: 10 },
  sectionLabel: { fontSize: 11, fontWeight: 700, color: "#999", letterSpacing: ".07em", textTransform: "uppercase" as const, marginBottom: 4 },
  sectionText:  { fontSize: 13.5, color: "#333", lineHeight: 1.5 },
  historyFooter:    { fontSize: 12, color: "#aaa", marginTop: 8 },
  cancelOutlineBtn: { padding: "7px 16px", background: "transparent", color: "#DC2626", border: "1.5px solid #FECACA", borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer" },
  cancelDangerBtn:  { padding: "6px 14px", background: "#DC2626", color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer" },
  cancelGhostBtn:   { padding: "6px 14px", background: "transparent", color: "#555", border: "1.5px solid #D0CEC9", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" },
};
