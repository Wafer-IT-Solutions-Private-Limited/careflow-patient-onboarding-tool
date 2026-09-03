"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

type Availability = "AVAILABLE" | "ENGAGED" | "OFFLINE";
type ListeningField = "healthNotes" | "prescription" | null;

interface DoctorInfo { id: string; availability: Availability; specialization: string; user: { name: string; email: string } }
interface PatientInfo { prn: string; name: string; gender?: string; priority: string; healthIssues?: string }
interface VisitSummary { id: string; token: string; visitId: string; status: string; healthIssue?: string; patient: PatientInfo }
interface HistoryRecord { id: string; prescription?: string; healthNotes?: string }
interface VitalsRecord {
  systolicBP: number | null; diastolicBP: number | null; bloodSugar: number | null;
  temperature: number | null; pulse: number | null; spo2: number | null;
  weight: number | null; height: number | null; hemoglobin: number | null;
  wbc: number | null; platelets: number | null; urineRoutine: string | null; notes: string | null;
  requestedBy: string | null; requiredFields: string[] | null; updatedAt: string;
}

interface DashboardData {
  doctor:         DoctorInfo;
  currentVisit:   (VisitSummary & { healthIssue?: string; patient: PatientInfo & { id?: string }; history?: HistoryRecord; vitals?: VitalsRecord | null }) | null;
  queuedVisits:   VisitSummary[];
  todayCompleted: number;
}

function parseHealthProfile(raw?: string): { label: string; value: string }[] {
  if (!raw) return [];
  return raw.split(" | ").map(part => {
    const idx = part.indexOf(": ");
    return idx > -1 ? { label: part.slice(0, idx), value: part.slice(idx + 2) } : { label: part, value: "" };
  }).filter(p => p.value && !p.label.startsWith("Emergency Contact"));
}

interface PatientHistoryItem {
  id: string;
  prescription?: string;
  healthNotes?: string;
  consultationStart: string;
  consultationEnd?: string;
  duration?: number;
  doctor: { user: { name: string } };
  visit:  { token: string; visitId: string; visitDate: string };
}

const AVAIL_COLORS: Record<Availability, string> = {
  AVAILABLE: "#059669", ENGAGED: "#D97706", OFFLINE: "#9CA3AF",
};

export default function DoctorDashboard() {
  const router = useRouter();
  const [data, setData]                 = useState<DashboardData | null>(null);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [requestingVitals, setRequestingVitals] = useState(false);
  const [showVitalsModal, setShowVitalsModal]   = useState(false);
  const [selectedFields, setSelectedFields]     = useState<string[]>([]);
  const [prescription, setPrescription] = useState("");
  const [healthNotes, setHealthNotes]   = useState("");

  // Voice recognition state
  const [listening, setListening]       = useState<ListeningField>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef  = useRef<any>(null);
  const baseTextRef     = useRef("");
  const finalAccumRef   = useRef("");

  const doctorIdRef = useRef<string | null>(null);

  // Patient history modal
  const [historyPatientId, setHistoryPatientId]   = useState<string | null>(null);
  const [historyPatient, setHistoryPatient]         = useState<{ prn: string; name: string } | null>(null);
  const [patientHistory, setPatientHistory]         = useState<PatientHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading]         = useState(false);

  // Patient reports (read-only, only during IN_CONSULTATION)
  interface PatientReportMeta { id: string; name: string; mimeType: string; fileSize: number; extractedText: string | null; ocrUsed: boolean; uploadedAt: string; }
  const [patientReports, setPatientReports]         = useState<PatientReportMeta[]>([]);
  const [reportsExpanded, setReportsExpanded]       = useState<string | null>(null);
  const [reportsLoading, setReportsLoading]         = useState(false);
  const [reportsView, setReportsView]               = useState<Record<string, "text" | "file">>({}); // per-report view toggle

  const loadPatientReports = async (patientId: string) => {
    setReportsLoading(true);
    setPatientReports([]);
    try {
      const res = await fetch(`/api/doctor/patient-reports?patientId=${patientId}`);
      if (res.ok) { const d = await res.json(); setPatientReports(d.reports ?? []); }
    } catch { /* ignore */ } finally { setReportsLoading(false); }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const load = async () => {
    const res = await fetch("/api/doctor/dashboard");
    if (res.status === 403) { router.push("/login"); return; }
    const d = await res.json();
    setData(d);
    if (d.doctor?.id) doctorIdRef.current = d.doctor.id;
    if (d.currentVisit?.history) {
      setPrescription(d.currentVisit.history.prescription ?? "");
      setHealthNotes(d.currentVisit.history.healthNotes ?? "");
    } else {
      setPrescription(""); setHealthNotes("");
    }
    if (d.currentVisit?.patient?.id) {
      loadPatientReports(d.currentVisit.patient.id);
    } else {
      setPatientReports([]);
    }
  };

  useEffect(() => {
    let es: EventSource | null = null;
    const connectSSE = (doctorId: string) => {
      es = new EventSource(`/api/sse?doctorId=${doctorId}`);
      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          if (["queue:updated","patient:called","visit:cancelled","doctor:status","vitals:updated"].includes(event.type)) {
            load();
          }
        } catch { /* ignore */ }
      };
      es.onerror = () => { es?.close(); setTimeout(() => { if (doctorIdRef.current) connectSSE(doctorIdRef.current); }, 5000); };
    };
    load()
      .then(() => { if (doctorIdRef.current) connectSSE(doctorIdRef.current); })
      .finally(() => setLoading(false));
    return () => {
      es?.close();
      recognitionRef.current?.stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Voice recognition ──────────────────────────────────────────────────────
  const stopListening = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(null);
  };

  const startListening = (field: "healthNotes" | "prescription") => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error("Speech recognition not supported. Please use Chrome or Edge.");
      return;
    }

    // Stop any existing session first
    recognitionRef.current?.stop();
    recognitionRef.current = null;

    const currentVal = field === "healthNotes" ? healthNotes : prescription;
    baseTextRef.current   = currentVal.trim();
    finalAccumRef.current = "";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec: any = new SR();
    rec.continuous      = true;
    rec.interimResults  = true;
    rec.lang            = "en-IN";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (event: any) => {
      let newFinals = "";
      let interim   = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) newFinals += event.results[i][0].transcript;
        else interim = event.results[i][0].transcript;
      }
      finalAccumRef.current += newFinals;
      const parts   = [baseTextRef.current, finalAccumRef.current + interim].filter(Boolean);
      const display = parts.join(" ");
      if (field === "healthNotes") setHealthNotes(display);
      else setPrescription(display);
    };

    rec.onend = () => {
      // Commit final text without interim
      const parts = [baseTextRef.current, finalAccumRef.current].filter(Boolean);
      const final = parts.join(" ").trim();
      if (field === "healthNotes") setHealthNotes(final);
      else setPrescription(final);
      recognitionRef.current = null;
      setListening(null);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (event: any) => {
      if (event.error !== "aborted") toast.error(`Microphone error: ${event.error}`);
      recognitionRef.current = null;
      setListening(null);
    };

    recognitionRef.current = rec;
    rec.start();
    setListening(field);
  };

  const clearField = (field: "healthNotes" | "prescription") => {
    if (listening === field) stopListening();
    if (field === "healthNotes") setHealthNotes("");
    else setPrescription("");
  };

  // ── Consultation actions ───────────────────────────────────────────────────
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
    if (data?.currentVisit) {
      if (!healthNotes.trim())  { toast.error("Complete health notes before moving to next patient"); return; }
      if (!prescription.trim()) { toast.error("Complete prescription before moving to next patient"); return; }
      const saveRes = await fetch("/api/doctor/consultation", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitId: data.currentVisit.id, prescription, healthNotes }),
      });
      if (!saveRes.ok) { const d = await saveRes.json(); toast.error(d.error ?? "Failed to save consultation"); return; }
    }
    setSaving(true);
    const res = await fetch("/api/doctor/next-patient", { method: "POST" });
    const d = await res.json();
    if (res.ok) { toast.success(d.message); await load(); }
    else toast.error(d.error ?? "Error");
    setSaving(false);
  };

  const saveConsultation = async () => {
    if (!data?.currentVisit) return;
    if (!healthNotes.trim())  { toast.error("Health notes are required"); return; }
    if (!prescription.trim()) { toast.error("Prescription is required"); return; }
    setSaving(true);
    const res = await fetch("/api/doctor/consultation", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitId: data.currentVisit.id, prescription, healthNotes }),
    });
    if (res.ok) toast.success("Consultation saved");
    else toast.error("Failed to save");
    setSaving(false);
  };

  const VITAL_OPTIONS = [
    { key: "bp",          label: "Blood Pressure" },
    { key: "pulse",       label: "Pulse" },
    { key: "spo2",        label: "SpO₂" },
    { key: "temperature", label: "Temperature" },
    { key: "bloodSugar",  label: "Blood Sugar" },
    { key: "weight",      label: "Weight" },
    { key: "height",      label: "Height" },
    { key: "hemoglobin",  label: "Hemoglobin" },
    { key: "wbc",         label: "WBC" },
    { key: "platelets",   label: "Platelets" },
    { key: "urineRoutine",label: "Urine Routine" },
  ];

  const openVitalsModal = () => {
    setSelectedFields([]);
    setShowVitalsModal(true);
  };

  const toggleField = (key: string) => {
    setSelectedFields(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const requestVitals = async () => {
    if (!data?.currentVisit) return;
    setRequestingVitals(true);
    setShowVitalsModal(false);
    const res = await fetch("/api/doctor/vitals-request", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitId: data.currentVisit.id, requiredFields: selectedFields }),
    });
    if (res.ok) toast.success(selectedFields.length > 0 ? `Requested: ${selectedFields.length} vital(s)` : "Vitals request sent to nurse");
    else { const d = await res.json(); toast.error(d.error ?? "Failed to request vitals"); }
    setRequestingVitals(false);
  };

  const viewHistory = async (patientId: string) => {
    setHistoryLoading(true);
    setHistoryPatientId(patientId);
    const res = await fetch(`/api/doctor/patient-history?patientId=${patientId}`);
    const d = await res.json();
    setPatientHistory(d.histories ?? []);
    setHistoryPatient(d.patient ?? null);
    setHistoryLoading(false);
  };

  if (loading) return <div style={S.loading}>Loading…</div>;
  if (!data?.doctor) return <div style={S.loading}>Doctor profile not found.</div>;

  const { doctor, currentVisit, queuedVisits, todayCompleted } = data;

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div className="dr-header-inner" style={S.headerInner}>
          <div style={S.brand}>
            <img src="/waferlogo.png" alt="Wafer" style={S.logo} />
            <div>
              <div style={S.doctorName}>{doctor.user.name}</div>
              <div style={S.doctorSpec}>{doctor.specialization}</div>
            </div>
          </div>
          <div className="dr-header-right" style={S.headerRight}>
            <div className="dr-avail-row" style={S.availRow}>
              {(["AVAILABLE", "ENGAGED", "OFFLINE"] as Availability[]).map(a => (
                <button
                  key={a}
                  style={{ ...S.availBtn, ...(doctor.availability === a ? { background: AVAIL_COLORS[a], color: "#fff", border: `1px solid ${AVAIL_COLORS[a]}` } : {}) }}
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

      <main className="dr-main" style={S.main}>
        <div className="dr-stats" style={S.statsRow}>
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

        <div className="dr-grid" style={S.grid}>
          {/* Current Patient Panel */}
          <div style={S.panel}>
            <div style={S.panelTitle}>Current Patient</div>
            {currentVisit ? (
              <div>
                <div style={S.patientHdr}>
                  <div style={S.tokenBig}>{currentVisit.token}</div>
                  <div style={{ flex: 1 }}>
                    <div style={S.patName}>{currentVisit.patient.name}</div>
                    <div style={S.patMeta}>{currentVisit.patient.prn} · {currentVisit.patient.gender ?? "—"}</div>
                    {currentVisit.patient.priority !== "NORMAL" && (
                      <span style={{ ...S.priorityBadge, background: currentVisit.patient.priority === "EMERGENCY" ? "#FEE2E2" : "#FEF3C7", color: currentVisit.patient.priority === "EMERGENCY" ? "#DC2626" : "#D97706" }}>
                        {currentVisit.patient.priority}
                      </span>
                    )}
                  </div>
                  <button
                    style={S.historyBtn}
                    onClick={() => viewHistory((currentVisit.patient as { id?: string }).id ?? "")}
                  >
                    View History
                  </button>
                </div>
                {currentVisit.healthIssue && (
                  <div style={S.complaint}>
                    <div style={S.complaintLabel}>Patient Reported Symptoms</div>
                    <div style={S.complaintText}>{currentVisit.healthIssue}</div>
                  </div>
                )}
                {(() => {
                  const profile = parseHealthProfile(currentVisit.patient.healthIssues);
                  return profile.length > 0 ? (
                    <div style={S.healthProfile}>
                      <div style={S.complaintLabel}>Health Profile</div>
                      <div style={S.healthGrid}>
                        {profile.map(p => (
                          <div key={p.label} style={S.healthItem}>
                            <span style={S.healthItemLabel}>{p.label}</span>
                            <span style={S.healthItemVal}>{p.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}

                {/* Vitals Panel */}
                {(() => {
                  const v = currentVisit.vitals;
                  const vitalItems = v ? [
                    { label: "BP", value: v.systolicBP && v.diastolicBP ? `${v.systolicBP}/${v.diastolicBP} mmHg` : null },
                    { label: "Blood Sugar", value: v.bloodSugar ? `${v.bloodSugar} mg/dL` : null },
                    { label: "Temperature", value: v.temperature ? `${v.temperature} °F` : null },
                    { label: "Pulse", value: v.pulse ? `${v.pulse} bpm` : null },
                    { label: "SpO₂", value: v.spo2 ? `${v.spo2}%` : null },
                    { label: "Weight", value: v.weight ? `${v.weight} kg` : null },
                    { label: "Height", value: v.height ? `${v.height} cm` : null },
                    { label: "Hemoglobin", value: v.hemoglobin ? `${v.hemoglobin} g/dL` : null },
                    { label: "WBC", value: v.wbc ? `${v.wbc} ×10³/μL` : null },
                    { label: "Platelets", value: v.platelets ? `${v.platelets} ×10³/μL` : null },
                    { label: "Urine Routine", value: v.urineRoutine ?? null },
                    { label: "Notes", value: v.notes ?? null },
                  ].filter(i => i.value) : [];
                  return (
                    <div style={{ margin: "12px 0", padding: "14px 16px", background: v ? "#F0FDF4" : "#F8F7F5", borderRadius: 10, border: `1.5px solid ${v ? "#86EFAC" : "#E5E3DF"}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: vitalItems.length > 0 ? 10 : 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: v ? "#166534" : "#888", textTransform: "uppercase", letterSpacing: ".05em" }}>
                          {v ? "✓ Vitals Recorded" : "Vitals"}
                        </div>
                        <button
                          onClick={openVitalsModal}
                          disabled={requestingVitals}
                          style={{ fontSize: 12, fontWeight: 700, padding: "5px 14px", borderRadius: 7, border: "1.5px solid #0C1929", background: requestingVitals ? "#6B7280" : "#0C1929", color: "#fff", cursor: requestingVitals ? "not-allowed" : "pointer" }}
                        >
                          {requestingVitals ? "Sending…" : v ? "Request More Vitals" : "Request Vitals from Nurse"}
                        </button>
                      </div>
                      {vitalItems.length > 0 && (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 8 }}>
                          {vitalItems.map(i => (
                            <div key={i.label} style={{ background: "#fff", borderRadius: 8, padding: "7px 10px", border: "1px solid #D1FAE5" }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 2 }}>{i.label}</div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{i.value}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      {v && (
                        <div style={{ fontSize: 11, color: "#6B7280", marginTop: 8 }}>
                          Last updated: {new Date(v.updatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Patient Reports — read-only, only during IN_CONSULTATION */}
                <div style={{ background: "#F0F9FF", border: "1px solid #BAE6FD", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#0369A1", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: reportsLoading || patientReports.length > 0 ? 10 : 0 }}>
                    Patient Reports {reportsLoading ? "…" : `(${patientReports.length})`}
                  </div>
                  {reportsLoading ? (
                    <div style={{ fontSize: 12, color: "#aaa" }}>Loading…</div>
                  ) : patientReports.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#94A3B8" }}>No reports uploaded by this patient.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {patientReports.map(r => {
                        const isExpanded = reportsExpanded === r.id;
                        const view = reportsView[r.id] ?? "file";
                        const fileUrl = `/api/doctor/patient-reports/${r.id}/file`;
                        return (
                          <div key={r.id} style={{ background: "#fff", borderRadius: 8, border: "1px solid #E0F2FE", overflow: "hidden" }}>
                            {/* Header row */}
                            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer" }}
                              onClick={() => setReportsExpanded(isExpanded ? null : r.id)}>
                              <span style={{ fontSize: 16 }}>{r.mimeType === "application/pdf" ? "📄" : "🖼️"}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                                <div style={{ fontSize: 10, color: "#aaa" }}>
                                  {new Date(r.uploadedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                                  {r.ocrUsed && <span style={{ marginLeft: 8, color: "#7C3AED", fontWeight: 700 }}>• OCR</span>}
                                </div>
                              </div>
                              <span style={{ fontSize: 11, color: "#888" }}>{isExpanded ? "▲" : "▼"}</span>
                            </div>

                            {isExpanded && (
                              <div style={{ borderTop: "1px solid #E0F2FE", padding: "10px 12px" }}>
                                {/* Toggle: File view / Extracted text */}
                                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                                  {(["file", "text"] as const).map(v => (
                                    <button key={v} onClick={() => setReportsView(prev => ({ ...prev, [r.id]: v }))}
                                      style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6, border: "1.5px solid #0369A1",
                                        background: view === v ? "#0369A1" : "transparent", color: view === v ? "#fff" : "#0369A1", cursor: "pointer" }}>
                                      {v === "file" ? (r.mimeType === "application/pdf" ? "📄 PDF" : "🖼️ Image") : "📝 Extracted Text"}
                                    </button>
                                  ))}
                                </div>

                                {view === "file" ? (
                                  r.mimeType === "application/pdf" ? (
                                    <iframe src={fileUrl} title={r.name}
                                      style={{ width: "100%", height: 420, border: "1px solid #E0F2FE", borderRadius: 6 }} />
                                  ) : (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={fileUrl} alt={r.name}
                                      style={{ maxWidth: "100%", maxHeight: 400, borderRadius: 6, border: "1px solid #E0F2FE", display: "block" }} />
                                  )
                                ) : (
                                  r.extractedText ? (
                                    <pre style={{ fontSize: 11.5, color: "#334155", background: "#F8FAFC", borderRadius: 6, padding: "8px 10px", whiteSpace: "pre-wrap", maxHeight: 300, overflowY: "auto", fontFamily: "ui-monospace, monospace", lineHeight: 1.5, margin: 0 }}>
                                      {r.extractedText}
                                    </pre>
                                  ) : (
                                    <div style={{ fontSize: 12, color: "#aaa", fontStyle: "italic" }}>
                                      No text could be extracted — view the file directly above.
                                    </div>
                                  )
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Health Notes Field */}
                <div style={S.field}>
                  <div style={S.labelRow}>
                    <label style={S.label}>Health Notes</label>
                    <div style={S.voiceControls}>
                      <button
                        type="button"
                        style={listening === "healthNotes" ? S.stopBtn : S.micBtn}
                        onClick={() => listening === "healthNotes" ? stopListening() : startListening("healthNotes")}
                        title={listening === "healthNotes" ? "Stop recording" : "Dictate health notes"}
                      >
                        {listening === "healthNotes" ? "■ Stop" : "🎤 Dictate"}
                      </button>
                      <button
                        type="button"
                        style={S.clearBtn}
                        onClick={() => clearField("healthNotes")}
                        title="Clear health notes"
                      >
                        ✕ Clear
                      </button>
                    </div>
                  </div>
                  <textarea
                    style={{ ...S.textarea, ...(listening === "healthNotes" ? S.textareaActive : {}) }}
                    value={healthNotes}
                    onChange={e => { if (listening !== "healthNotes") setHealthNotes(e.target.value); }}
                    readOnly={listening === "healthNotes"}
                    placeholder="Observations, diagnosis, notes… (or click 🎤 to dictate)"
                    rows={4}
                  />
                  {listening === "healthNotes" && (
                    <div style={S.listeningHint}>🔴 Listening… speak clearly, then click ■ Stop</div>
                  )}
                </div>

                {/* Prescription Field */}
                <div style={S.field}>
                  <div style={S.labelRow}>
                    <label style={S.label}>Prescription</label>
                    <div style={S.voiceControls}>
                      <button
                        type="button"
                        style={listening === "prescription" ? S.stopBtn : S.micBtn}
                        onClick={() => listening === "prescription" ? stopListening() : startListening("prescription")}
                        title={listening === "prescription" ? "Stop recording" : "Dictate prescription"}
                      >
                        {listening === "prescription" ? "■ Stop" : "🎤 Dictate"}
                      </button>
                      <button
                        type="button"
                        style={S.clearBtn}
                        onClick={() => clearField("prescription")}
                        title="Clear prescription"
                      >
                        ✕ Clear
                      </button>
                    </div>
                  </div>
                  <textarea
                    style={{ ...S.textarea, ...(listening === "prescription" ? S.textareaActive : {}) }}
                    value={prescription}
                    onChange={e => { if (listening !== "prescription") setPrescription(e.target.value); }}
                    readOnly={listening === "prescription"}
                    placeholder="Medications, dosage, instructions… (or click 🎤 to dictate)"
                    rows={4}
                  />
                  {listening === "prescription" && (
                    <div style={S.listeningHint}>🔴 Listening… speak clearly, then click ■ Stop</div>
                  )}
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

          {/* Queue Panel */}
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
                      {v.patient.healthIssues && (
                        <div style={S.queueComplaint}>{v.patient.healthIssues}</div>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                      {v.patient.priority !== "NORMAL" && (
                        <span style={{ ...S.priorityBadge, background: v.patient.priority === "EMERGENCY" ? "#FEE2E2" : "#FEF3C7", color: v.patient.priority === "EMERGENCY" ? "#DC2626" : "#D97706" }}>
                          {v.patient.priority}
                        </span>
                      )}
                      <button style={S.historyBtnSm} onClick={() => viewHistory((v.patient as { id?: string }).id ?? "")}>
                        History
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <style>{`
        input::placeholder, textarea::placeholder { color: #888 !important; opacity: 1; }
        select option { color: #111; }
        @media (max-width: 639px) {
          .dr-header-inner { height: auto !important; flex-wrap: wrap !important; padding: 10px 14px !important; gap: 10px !important; }
          .dr-header-right { width: 100% !important; justify-content: space-between !important; }
          .dr-main         { padding: 16px 12px !important; }
          .dr-stats        { grid-template-columns: repeat(3, 1fr) !important; gap: 8px !important; }
          .dr-grid         { grid-template-columns: 1fr !important; }
          .dr-avail-row    { gap: 4px !important; flex: 1; }
          .dr-avail-row button { padding: 5px 8px !important; font-size: 10px !important; flex: 1; }
        }
        @media (min-width: 640px) and (max-width: 1023px) {
          .dr-header-inner { height: auto !important; flex-wrap: wrap !important; padding: 10px 18px !important; gap: 10px !important; }
          .dr-header-right { width: 100% !important; justify-content: space-between !important; }
          .dr-main  { padding: 20px 18px !important; }
          .dr-grid  { grid-template-columns: 1fr !important; }
          .dr-stats { grid-template-columns: repeat(3, 1fr) !important; }
        }
      `}</style>

      {/* Vitals Request Modal */}
      {showVitalsModal && (
        <div style={S.modalOverlay} onClick={() => setShowVitalsModal(false)}>
          <div style={{ ...S.modal, maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div style={S.modalHeader}>
              <div>
                <div style={S.modalTitle}>Request Vitals from Nurse</div>
                <div style={S.modalSub}>Select which vitals are mandatory. Nurse cannot submit without them.</div>
              </div>
              <button style={S.modalClose} onClick={() => setShowVitalsModal(false)}>✕</button>
            </div>
            <div style={{ padding: "16px 28px 8px" }}>
              {/* All toggle */}
              <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid #F0EEEB", cursor: "pointer", marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={selectedFields.length === VITAL_OPTIONS.length}
                  onChange={e => setSelectedFields(e.target.checked ? VITAL_OPTIONS.map(o => o.key) : [])}
                  style={{ width: 16, height: 16, accentColor: "#0C1929" }}
                />
                <span style={{ fontWeight: 700, fontSize: 13, color: "#0C1929" }}>All Vitals</span>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }}>
                {VITAL_OPTIONS.map(o => (
                  <label key={o.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={selectedFields.includes(o.key)}
                      onChange={() => toggleField(o.key)}
                      style={{ width: 15, height: 15, accentColor: "#0C1929" }}
                    />
                    <span style={{ fontSize: 13, color: "#333" }}>{o.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, padding: "16px 28px 24px" }}>
              <button onClick={() => setShowVitalsModal(false)} style={{ flex: 1, padding: "10px", background: "transparent", border: "1.5px solid #D0CEC9", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#666" }}>
                Cancel
              </button>
              <button
                onClick={requestVitals}
                disabled={requestingVitals}
                style={{ flex: 2, padding: "10px", background: "#0C1929", color: "#fff", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              >
                {selectedFields.length === 0 ? "Send General Request" : `Request ${selectedFields.length} Vital${selectedFields.length > 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Patient History Modal */}
      {historyPatientId && (
        <div style={S.modalOverlay} onClick={() => { setHistoryPatientId(null); setPatientHistory([]); }}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={S.modalHeader}>
              <div>
                <div style={S.modalTitle}>Consultation History</div>
                {historyPatient && (
                  <div style={S.modalSub}>{historyPatient.name} · {historyPatient.prn}</div>
                )}
              </div>
              <button style={S.modalClose} onClick={() => { setHistoryPatientId(null); setPatientHistory([]); }}>✕</button>
            </div>

            {historyLoading ? (
              <div style={{ padding: "40px 0", textAlign: "center", color: "#aaa" }}>Loading…</div>
            ) : patientHistory.length === 0 ? (
              <div style={{ padding: "40px 0", textAlign: "center", color: "#aaa" }}>No consultation history yet.</div>
            ) : (
              <div style={S.historyList}>
                {patientHistory.map(h => (
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
        </div>
      )}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  loading:          { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui,sans-serif", color: "#888" },
  page:             { minHeight: "100vh", background: "#F0F2F5", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif" },
  header:           { background: "#0C1929", padding: "0 24px" },
  headerInner:      { maxWidth: 1200, margin: "0 auto", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" },
  brand:            { display: "flex", alignItems: "center", gap: 12 },
  logo:             { height: 30, filter: "brightness(0) invert(1)" },
  doctorName:       { fontSize: 15, fontWeight: 700, color: "#fff" },
  doctorSpec:       { fontSize: 12, color: "rgba(255,255,255,.55)" },
  headerRight:      { display: "flex", alignItems: "center", gap: 12 },
  availRow:         { display: "flex", gap: 4 },
  availBtn:         { padding: "5px 12px", border: "1px solid rgba(255,255,255,.25)", borderRadius: 8, background: "transparent", color: "rgba(255,255,255,.6)", fontSize: 11.5, fontWeight: 700, cursor: "pointer", letterSpacing: ".04em", transition: "all .15s" },
  logoutBtn:        { fontSize: 12.5, color: "rgba(255,255,255,.6)", background: "transparent", border: "1px solid rgba(255,255,255,.2)", borderRadius: 8, padding: "5px 12px", cursor: "pointer" },
  main:             { maxWidth: 1200, margin: "0 auto", padding: "28px 24px" },
  statsRow:         { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 },
  statCard:         { background: "#fff", borderRadius: 12, padding: "18px 20px", boxShadow: "0 1px 4px rgba(0,0,0,.05)", border: "1.5px solid #E8E6E3" },
  statNum:          { display: "block", fontSize: 28, fontWeight: 800, color: "#0C1929", marginBottom: 2 },
  statLabel:        { fontSize: 12, color: "#888", fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase" },
  grid:             { display: "grid", gridTemplateColumns: "1fr 380px", gap: 18 },
  panel:            { background: "#fff", borderRadius: 14, padding: "24px 28px", boxShadow: "0 1px 6px rgba(0,0,0,.05)" },
  panelTitle:       { fontSize: 13, fontWeight: 700, color: "#0C1929", marginBottom: 20, letterSpacing: ".05em", textTransform: "uppercase" },
  patientHdr:       { display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 20 },
  tokenBig:         { fontSize: 52, fontWeight: 800, color: "#0C1929", lineHeight: 1, flexShrink: 0 },
  patName:          { fontSize: 20, fontWeight: 700, color: "#0C1929", marginBottom: 4 },
  patMeta:          { fontSize: 13, color: "#666", marginBottom: 6 },
  priorityBadge:    { fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 12, letterSpacing: ".05em" },
  historyBtn:       { padding: "7px 14px", background: "#EFF6FF", color: "#2563EB", border: "1.5px solid #BFDBFE", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const },
  historyBtnSm:     { padding: "4px 10px", background: "#EFF6FF", color: "#2563EB", border: "1.5px solid #BFDBFE", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer" },
  complaint:        { background: "#F8F7F5", borderRadius: 10, padding: "12px 16px", marginBottom: 12 },
  complaintLabel:   { fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 6 },
  complaintText:    { fontSize: 13.5, color: "#333" },
  healthProfile:    { background: "#EFF6FF", border: "1.5px solid #BFDBFE", borderRadius: 10, padding: "12px 16px", marginBottom: 16 },
  healthGrid:       { display: "flex", flexWrap: "wrap" as const, gap: 8 },
  healthItem:       { background: "#fff", borderRadius: 8, padding: "6px 12px", border: "1px solid #DBEAFE", display: "flex", flexDirection: "column" as const, gap: 2 },
  healthItemLabel:  { fontSize: 10, fontWeight: 700, color: "#2563EB", textTransform: "uppercase" as const, letterSpacing: ".06em" },
  healthItemVal:    { fontSize: 13, fontWeight: 700, color: "#1E3A5F" },
  field:            { marginBottom: 14 },
  labelRow:         { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  label:            { fontSize: 11, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: ".07em" },
  voiceControls:    { display: "flex", gap: 6 },
  micBtn:           { display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", background: "#EFF6FF", color: "#2563EB", border: "1.5px solid #BFDBFE", borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const },
  stopBtn:          { display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", background: "#FEE2E2", color: "#DC2626", border: "1.5px solid #FECACA", borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const },
  clearBtn:         { padding: "4px 10px", background: "#F5F4F2", color: "#666", border: "1.5px solid #E2E0DC", borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: "pointer" },
  textarea:         { width: "100%", padding: "10px 14px", border: "1.5px solid #E2E0DC", borderRadius: 9, fontSize: 13.5, color: "#111", resize: "vertical", outline: "none", boxSizing: "border-box", fontFamily: "inherit", transition: "border-color .15s, box-shadow .15s" },
  textareaActive:   { border: "1.5px solid #DC2626", boxShadow: "0 0 0 3px rgba(220,38,38,.10)", background: "#FFFAFA" },
  listeningHint:    { marginTop: 5, fontSize: 11.5, color: "#DC2626", fontWeight: 600, letterSpacing: ".01em" },
  actionRow:        { display: "flex", gap: 10, marginTop: 6 },
  saveBtn:          { padding: "10px 18px", background: "#E8F0FE", color: "#1A56DB", border: "none", borderRadius: 9, fontSize: 13.5, fontWeight: 600, cursor: "pointer" },
  nextBtn:          { padding: "10px 18px", background: "#0C1929", color: "#fff", border: "none", borderRadius: 9, fontSize: 13.5, fontWeight: 600, cursor: "pointer", flex: 1 },
  emptyPanel:       { textAlign: "center", padding: "40px 0" },
  emptyIcon:        { fontSize: 32, marginBottom: 10 },
  emptyText:        { fontSize: 14, color: "#888", marginBottom: 16 },
  queueList:        { display: "flex", flexDirection: "column", gap: 10 },
  queueItem:        { display: "flex", alignItems: "flex-start", gap: 14, background: "#F8F7F5", borderRadius: 10, padding: "12px 16px" },
  queuePos:         { width: 28, height: 28, background: "#0C1929", color: "#fff", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 },
  queueToken:       { fontSize: 16, fontWeight: 800, color: "#0C1929" },
  queueName:        { fontSize: 13, color: "#444" },
  queuePrn:         { fontSize: 11.5, color: "#999" },
  queueComplaint:   { fontSize: 11.5, color: "#888", marginTop: 2, fontStyle: "italic" },
  // Modal
  modalOverlay:     { position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 24 },
  modal:            { background: "#fff", borderRadius: 18, width: "100%", maxWidth: 640, maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,.18)" },
  modalHeader:      { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "24px 28px 16px", borderBottom: "1px solid #F0EEEB" },
  modalTitle:       { fontSize: 17, fontWeight: 700, color: "#0C1929" },
  modalSub:         { fontSize: 13, color: "#888", marginTop: 2 },
  modalClose:       { background: "#F5F4F2", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 14, color: "#666", display: "flex", alignItems: "center", justifyContent: "center" },
  historyList:      { overflowY: "auto", padding: "16px 28px 24px", display: "flex", flexDirection: "column", gap: 14 },
  historyCard:      { background: "#F8F7F5", borderRadius: 12, padding: "16px 20px" },
  historyHeader:    { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  historyToken:     { fontSize: 16, fontWeight: 800, color: "#0C1929", marginRight: 8 },
  historyDate:      { fontSize: 12, color: "#888" },
  historyDoctor:    { fontSize: 12, fontWeight: 600, color: "#2563EB" },
  historySection:   { marginBottom: 8 },
  sectionLabel:     { fontSize: 11, fontWeight: 700, color: "#999", letterSpacing: ".07em", textTransform: "uppercase", marginBottom: 3 },
  sectionText:      { fontSize: 13.5, color: "#333", lineHeight: 1.5 },
  historyFooter:    { fontSize: 12, color: "#aaa", marginTop: 6 },
};
