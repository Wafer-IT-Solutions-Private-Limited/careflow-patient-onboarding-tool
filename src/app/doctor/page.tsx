"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

type Availability = "AVAILABLE" | "ENGAGED" | "OFFLINE";

interface DoctorInfo { id: string; availability: Availability; specialization: string; user: { name: string; email: string } }
interface VisitSummary { id: string; token: string; visitId: string; status: string; patient: { prn: string; name: string; gender?: string; priority: string; healthIssues?: string } }
interface HistoryRecord { id: string; prescription?: string; healthNotes?: string }

interface DashboardData {
  doctor:         DoctorInfo;
  currentVisit:   (VisitSummary & { history?: HistoryRecord }) | null;
  queuedVisits:   VisitSummary[];
  todayCompleted: number;
}

const AVAIL_COLORS: Record<Availability, string> = {
  AVAILABLE: "#059669", ENGAGED: "#D97706", OFFLINE: "#9CA3AF",
};

export default function DoctorDashboard() {
  const router = useRouter();
  const [data, setData]           = useState<DashboardData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [prescription, setPrescription] = useState("");
  const [healthNotes, setHealthNotes]   = useState("");

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const load = async () => {
    const res = await fetch("/api/doctor/dashboard");
    if (res.status === 403) { router.push("/login"); return; }
    const d = await res.json();
    setData(d);
    if (d.currentVisit?.history) {
      setPrescription(d.currentVisit.history.prescription ?? "");
      setHealthNotes(d.currentVisit.history.healthNotes ?? "");
    } else {
      setPrescription(""); setHealthNotes("");
    }
  };

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const toggleAvailability = async (a: Availability) => {
    setSaving(true);
    const res = await fetch("/api/doctor/availability", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ availability: a }),
    });
    if (res.ok) { toast.success(`Status: ${a}`); await load(); }
    else toast.error("Failed to update status");
    setSaving(false);
  };

  const nextPatient = async () => {
    setSaving(true);
    const res = await fetch("/api/doctor/next-patient", { method: "POST" });
    const d = await res.json();
    if (res.ok) { toast.success(d.message); await load(); }
    else toast.error(d.error ?? "Error");
    setSaving(false);
  };

  const saveConsultation = async () => {
    if (!data?.currentVisit) return;
    setSaving(true);
    const res = await fetch("/api/doctor/consultation", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitId: data.currentVisit.id, prescription, healthNotes }),
    });
    if (res.ok) toast.success("Consultation saved");
    else toast.error("Failed to save");
    setSaving(false);
  };

  if (loading) return <div style={S.loading}>Loading…</div>;
  if (!data?.doctor) return <div style={S.loading}>Doctor profile not found.</div>;

  const { doctor, currentVisit, queuedVisits, todayCompleted } = data;

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div style={S.headerInner}>
          <div style={S.brand}>
            <img src="/waferlogo.png" alt="Wafer" style={S.logo} />
            <div>
              <div style={S.doctorName}>{doctor.user.name}</div>
              <div style={S.doctorSpec}>{doctor.specialization}</div>
            </div>
          </div>
          <div style={S.headerRight}>
            <div style={S.availRow}>
              {(["AVAILABLE", "ENGAGED", "OFFLINE"] as Availability[]).map(a => (
                <button
                  key={a}
                  style={{ ...S.availBtn, ...(doctor.availability === a ? { background: AVAIL_COLORS[a], color: "#fff", borderColor: AVAIL_COLORS[a] } : {}) }}
                  onClick={() => toggleAvailability(a)} disabled={saving}
                >
                  {a}
                </button>
              ))}
            </div>
            <button style={S.logoutBtn} onClick={logout}>Sign Out</button>
          </div>
        </div>
      </header>

      <main style={S.main}>
        <div style={S.statsRow}>
          <div style={S.statCard}>
            <span style={S.statNum}>{todayCompleted}</span>
            <span style={S.statLabel}>Completed Today</span>
          </div>
          <div style={S.statCard}>
            <span style={S.statNum}>{queuedVisits.length}</span>
            <span style={S.statLabel}>In Queue</span>
          </div>
          <div style={{ ...S.statCard, background: AVAIL_COLORS[doctor.availability] + "15", border: `1.5px solid ${AVAIL_COLORS[doctor.availability]}55` }}>
            <span style={{ ...S.statNum, color: AVAIL_COLORS[doctor.availability] }}>{doctor.availability}</span>
            <span style={S.statLabel}>Your Status</span>
          </div>
        </div>

        <div style={S.grid}>
          <div style={S.panel}>
            <div style={S.panelTitle}>Current Patient</div>
            {currentVisit ? (
              <div>
                <div style={S.patientHdr}>
                  <div style={S.tokenBig}>{currentVisit.token}</div>
                  <div>
                    <div style={S.patName}>{currentVisit.patient.name}</div>
                    <div style={S.patMeta}>{currentVisit.patient.prn} · {currentVisit.patient.gender ?? "—"}</div>
                    {currentVisit.patient.priority !== "NORMAL" && (
                      <span style={{ ...S.priorityBadge, background: currentVisit.patient.priority === "EMERGENCY" ? "#FEE2E2" : "#FEF3C7", color: currentVisit.patient.priority === "EMERGENCY" ? "#DC2626" : "#D97706" }}>
                        {currentVisit.patient.priority}
                      </span>
                    )}
                  </div>
                </div>
                {currentVisit.patient.healthIssues && (
                  <div style={S.complaint}>
                    <div style={S.complaintLabel}>Chief Complaint</div>
                    <div style={S.complaintText}>{currentVisit.patient.healthIssues}</div>
                  </div>
                )}
                <div style={S.field}>
                  <label style={S.label}>Health Notes</label>
                  <textarea style={S.textarea} value={healthNotes}
                    onChange={e => setHealthNotes(e.target.value)}
                    placeholder="Observations, diagnosis, notes…" rows={4} />
                </div>
                <div style={S.field}>
                  <label style={S.label}>Prescription</label>
                  <textarea style={S.textarea} value={prescription}
                    onChange={e => setPrescription(e.target.value)}
                    placeholder="Medications, dosage, instructions…" rows={4} />
                </div>
                <div style={S.actionRow}>
                  <button style={S.saveBtn} onClick={saveConsultation} disabled={saving}>
                    {saving ? "Saving…" : "Save Notes"}
                  </button>
                  <button style={S.nextBtn} onClick={nextPatient} disabled={saving}>
                    {saving ? "…" : "Complete & Next Patient →"}
                  </button>
                </div>
              </div>
            ) : (
              <div style={S.emptyPanel}>
                <div style={S.emptyIcon}>👨‍⚕️</div>
                <div style={S.emptyText}>No patient in consultation.</div>
                <button style={S.nextBtn} onClick={nextPatient} disabled={saving || queuedVisits.length === 0}>
                  {queuedVisits.length > 0 ? "Call Next Patient →" : "Queue is empty"}
                </button>
              </div>
            )}
          </div>

          <div style={S.panel}>
            <div style={S.panelTitle}>Queue ({queuedVisits.length})</div>
            {queuedVisits.length === 0 ? (
              <div style={S.emptyPanel}>
                <div style={S.emptyIcon}>✅</div>
                <div style={S.emptyText}>Queue is empty.</div>
              </div>
            ) : (
              <div style={S.queueList}>
                {queuedVisits.map((v, i) => (
                  <div key={v.id} style={S.queueItem}>
                    <div style={S.queuePos}>{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={S.queueToken}>{v.token}</div>
                      <div style={S.queueName}>{v.patient.name}</div>
                      <div style={S.queuePrn}>{v.patient.prn}</div>
                    </div>
                    {v.patient.priority !== "NORMAL" && (
                      <span style={{ ...S.priorityBadge, background: v.patient.priority === "EMERGENCY" ? "#FEE2E2" : "#FEF3C7", color: v.patient.priority === "EMERGENCY" ? "#DC2626" : "#D97706" }}>
                        {v.patient.priority}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  loading:       { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui,sans-serif", color: "#888" },
  page:          { minHeight: "100vh", background: "#F0F2F5", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif" },
  header:        { background: "#0C1929", padding: "0 24px" },
  headerInner:   { maxWidth: 1200, margin: "0 auto", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" },
  brand:         { display: "flex", alignItems: "center", gap: 12 },
  logo:          { height: 30, filter: "brightness(0) invert(1)" },
  doctorName:    { fontSize: 15, fontWeight: 700, color: "#fff" },
  doctorSpec:    { fontSize: 12, color: "rgba(255,255,255,.55)" },
  headerRight:   { display: "flex", alignItems: "center", gap: 12 },
  availRow:      { display: "flex", gap: 4 },
  availBtn:      { padding: "5px 12px", border: "1px solid rgba(255,255,255,.25)", borderRadius: 8, background: "transparent", color: "rgba(255,255,255,.6)", fontSize: 11.5, fontWeight: 700, cursor: "pointer", letterSpacing: ".04em", transition: "all .15s" },
  logoutBtn:     { fontSize: 12.5, color: "rgba(255,255,255,.6)", background: "transparent", border: "1px solid rgba(255,255,255,.2)", borderRadius: 8, padding: "5px 12px", cursor: "pointer" },
  main:          { maxWidth: 1200, margin: "0 auto", padding: "28px 24px" },
  statsRow:      { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 },
  statCard:      { background: "#fff", borderRadius: 12, padding: "18px 20px", boxShadow: "0 1px 4px rgba(0,0,0,.05)", border: "1.5px solid #E8E6E3" },
  statNum:       { display: "block", fontSize: 28, fontWeight: 800, color: "#0C1929", marginBottom: 2 },
  statLabel:     { fontSize: 12, color: "#888", fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase" },
  grid:          { display: "grid", gridTemplateColumns: "1fr 380px", gap: 18 },
  panel:         { background: "#fff", borderRadius: 14, padding: "24px 28px", boxShadow: "0 1px 6px rgba(0,0,0,.05)" },
  panelTitle:    { fontSize: 13, fontWeight: 700, color: "#0C1929", marginBottom: 20, letterSpacing: ".05em", textTransform: "uppercase" },
  patientHdr:    { display: "flex", gap: 20, alignItems: "flex-start", marginBottom: 20 },
  tokenBig:      { fontSize: 52, fontWeight: 800, color: "#0C1929", lineHeight: 1, flexShrink: 0 },
  patName:       { fontSize: 20, fontWeight: 700, color: "#0C1929", marginBottom: 4 },
  patMeta:       { fontSize: 13, color: "#666", marginBottom: 6 },
  priorityBadge: { fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 12, letterSpacing: ".05em" },
  complaint:     { background: "#F8F7F5", borderRadius: 10, padding: "12px 16px", marginBottom: 16 },
  complaintLabel:{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 4 },
  complaintText: { fontSize: 13.5, color: "#333" },
  field:         { marginBottom: 14 },
  label:         { display: "block", fontSize: 11, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 6 },
  textarea:      { width: "100%", padding: "10px 14px", border: "1.5px solid #E2E0DC", borderRadius: 9, fontSize: 13.5, color: "#111", resize: "vertical", outline: "none", boxSizing: "border-box", fontFamily: "inherit" },
  actionRow:     { display: "flex", gap: 10, marginTop: 6 },
  saveBtn:       { padding: "10px 18px", background: "#E8F0FE", color: "#1A56DB", border: "none", borderRadius: 9, fontSize: 13.5, fontWeight: 600, cursor: "pointer" },
  nextBtn:       { padding: "10px 18px", background: "#0C1929", color: "#fff", border: "none", borderRadius: 9, fontSize: 13.5, fontWeight: 600, cursor: "pointer", flex: 1 },
  emptyPanel:    { textAlign: "center", padding: "40px 0" },
  emptyIcon:     { fontSize: 32, marginBottom: 10 },
  emptyText:     { fontSize: 14, color: "#888", marginBottom: 16 },
  queueList:     { display: "flex", flexDirection: "column", gap: 10 },
  queueItem:     { display: "flex", alignItems: "center", gap: 14, background: "#F8F7F5", borderRadius: 10, padding: "12px 16px" },
  queuePos:      { width: 28, height: 28, background: "#0C1929", color: "#fff", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 },
  queueToken:    { fontSize: 16, fontWeight: 800, color: "#0C1929" },
  queueName:     { fontSize: 13, color: "#444" },
  queuePrn:      { fontSize: 11.5, color: "#999" },
};
