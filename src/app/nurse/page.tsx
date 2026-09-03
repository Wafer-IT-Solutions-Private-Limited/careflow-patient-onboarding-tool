"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import toast, { Toaster } from "react-hot-toast";

interface Patient { id: string; prn: string; name: string; gender: string | null; dateOfBirth: string | null; priority: string; }
interface Doctor  { user: { name: string } }
interface Vitals  {
  systolicBP: number | null; diastolicBP: number | null; bloodSugar: number | null;
  temperature: number | null; pulse: number | null; spo2: number | null;
  weight: number | null; height: number | null; hemoglobin: number | null;
  wbc: number | null; platelets: number | null; urineRoutine: string | null; notes: string | null;
  requestedBy: string | null; requiredFields: string | null;
  updatedAt?: string;
}
interface Visit {
  id: string; token: string; visitId: string; status: string;
  healthIssue: string | null; priority: string; createdAt?: string;
  patient: Patient; doctor: Doctor | null; vitals: Vitals | null;
}

type VitalsForm = Partial<Record<
  "systolicBP"|"diastolicBP"|"bloodSugar"|"temperature"|"pulse"|"spo2"|
  "weight"|"height"|"hemoglobin"|"wbc"|"platelets"|"urineRoutine"|"notes",
  string
>>;

const STATUS: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  WAITING:         { label: "Waiting",         bg: "#FEF3C7", text: "#92400E", dot: "#F59E0B" },
  ASSIGNED:        { label: "Assigned",         bg: "#DBEAFE", text: "#1E40AF", dot: "#3B82F6" },
  IN_CONSULTATION: { label: "In Consultation",  bg: "#D1FAE5", text: "#065F46", dot: "#10B981" },
};

function age(dob: string | null) {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
}

function waitTime(createdAt?: string) {
  if (!createdAt) return null;
  const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  if (mins < 1) return "Just arrived";
  if (mins < 60) return `${mins}m waiting`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m waiting`;
}

function VitalChip({ label, value }: { label: string; value: string | number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 20, padding: "2px 10px", fontSize: 11, color: "#166534", fontWeight: 600 }}>
      <span style={{ color: "#9CA3AF", fontWeight: 400 }}>{label}</span> {value}
    </span>
  );
}

export default function NursePage() {
  const router = useRouter();
  const [visits, setVisits]         = useState<Visit[]>([]);
  const [loading, setLoading]       = useState(true);
  const [active, setActive]         = useState<Visit | null>(null);
  const [form, setForm]             = useState<VitalsForm>({});
  const [saving, setSaving]         = useState(false);
  const [required, setRequired]     = useState<string[]>([]);
  const [requests, setRequests]     = useState<{ visitId: string; patientName: string; requiredFields?: string[] }[]>([]);
  const [urgentLoading, setUrgentLoading] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/nurse/queue");
      if (res.status === 401 || res.status === 403) { router.push("/login"); return; }
      const d = await res.json();
      setVisits(d.visits ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const es = new EventSource("/api/sse");
    esRef.current = es;
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (["queue:updated", "visit:cancelled", "patient:called"].includes(ev.type)) load();
        if (ev.type === "vitals:requested") {
          setRequests(r => r.find(x => x.visitId === ev.visitId) ? r : [...r, { visitId: ev.visitId, patientName: ev.patientName, requiredFields: ev.requiredFields }]);
          toast(`🔔 Dr. requests vitals for ${ev.patientName}`, { duration: 6000 });
          load();
        }
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [load]);

  const openVitals = (v: Visit) => {
    setActive(v);
    const ex = v.vitals;
    setForm({
      systolicBP:   ex?.systolicBP   != null ? String(ex.systolicBP)   : "",
      diastolicBP:  ex?.diastolicBP  != null ? String(ex.diastolicBP)  : "",
      bloodSugar:   ex?.bloodSugar   != null ? String(ex.bloodSugar)   : "",
      temperature:  ex?.temperature  != null ? String(ex.temperature)  : "",
      pulse:        ex?.pulse        != null ? String(ex.pulse)        : "",
      spo2:         ex?.spo2         != null ? String(ex.spo2)         : "",
      weight:       ex?.weight       != null ? String(ex.weight)       : "",
      height:       ex?.height       != null ? String(ex.height)       : "",
      hemoglobin:   ex?.hemoglobin   != null ? String(ex.hemoglobin)   : "",
      wbc:          ex?.wbc          != null ? String(ex.wbc)          : "",
      platelets:    ex?.platelets    != null ? String(ex.platelets)    : "",
      urineRoutine: ex?.urineRoutine ?? "",
      notes:        ex?.notes        ?? "",
    });
    // Load required fields from the vitals record (doctor's request)
    try {
      const rf = ex?.requiredFields ? JSON.parse(ex.requiredFields) : [];
      setRequired(Array.isArray(rf) ? rf : []);
    } catch { setRequired([]); }
  };

  // Map required field keys to form field keys
  const FIELD_MAP: Record<string, (keyof VitalsForm)[]> = {
    bp:          ["systolicBP", "diastolicBP"],
    pulse:       ["pulse"],
    spo2:        ["spo2"],
    temperature: ["temperature"],
    bloodSugar:  ["bloodSugar"],
    weight:      ["weight"],
    height:      ["height"],
    hemoglobin:  ["hemoglobin"],
    wbc:         ["wbc"],
    platelets:   ["platelets"],
    urineRoutine:["urineRoutine"],
  };

  const FIELD_LABELS: Record<string, string> = {
    bp: "Blood Pressure", pulse: "Pulse", spo2: "SpO₂", temperature: "Temperature",
    bloodSugar: "Blood Sugar", weight: "Weight", height: "Height",
    hemoglobin: "Hemoglobin", wbc: "WBC", platelets: "Platelets", urineRoutine: "Urine Routine",
  };

  const saveVitals = async () => {
    if (!active) return;

    // Validate mandatory fields
    const missing: string[] = [];
    for (const key of required) {
      const formKeys = FIELD_MAP[key] ?? [];
      const allFilled = formKeys.every(fk => (form[fk] ?? "").toString().trim() !== "");
      if (!allFilled) missing.push(FIELD_LABELS[key] ?? key);
    }
    if (missing.length > 0) {
      toast.error(`Required by doctor: ${missing.join(", ")}`, { duration: 5000 });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/nurse/vitals", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitId: active.id, ...form }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error ?? "Failed to save"); return; }
      toast.success("Vitals saved");
      setRequests(r => r.filter(x => x.visitId !== active.id));
      setRequired([]);
      setActive(null);
      load();
    } finally { setSaving(false); }
  };

  const toggleUrgent = async (v: Visit) => {
    const newPriority = v.priority === "URGENT" ? "NORMAL" : "URGENT";
    setUrgentLoading(v.id);
    try {
      await fetch("/api/nurse/queue", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitId: v.id, priority: newPriority }),
      });
      load();
    } finally { setUrgentLoading(null); }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  // Stats
  const pendingVitals = visits.filter(v => !v.vitals || !Object.values(v.vitals).some(x => x !== null && x !== "")).length;
  const doneVitals    = visits.length - pendingVitals;
  const urgent        = visits.filter(v => v.priority === "URGENT" || v.priority === "EMERGENCY").length;

  const inp: React.CSSProperties = { padding: "9px 12px", border: "1.5px solid #E2E0DC", borderRadius: 8, fontSize: 13, outline: "none", background: "#FDFCFB", color: "#111", width: "100%", boxSizing: "border-box" };

  return (
    <div style={{ minHeight: "100vh", background: "#F0F4F8", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif" }}>
      <Toaster position="top-right" />

      {/* Header */}
      <header style={{ background: "#0C1929", position: "sticky", top: 0, zIndex: 50, boxShadow: "0 2px 8px rgba(0,0,0,.25)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img src="/waferlogo.png" alt="Logo" style={{ height: 28, filter: "brightness(0) invert(1)" }} />
            <div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>Nurse Station</div>
              <div style={{ color: "rgba(255,255,255,.45)", fontSize: 11 }}>Today&apos;s live queue</div>
            </div>
            {requests.length > 0 && (
              <span style={{ background: "#EF4444", color: "#fff", borderRadius: 10, fontSize: 11, fontWeight: 800, padding: "2px 9px", marginLeft: 4 }}>
                {requests.length} urgent request{requests.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={load} style={{ fontSize: 12, color: "rgba(255,255,255,.6)", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontFamily: "inherit" }}>↻ Refresh</button>
            <button onClick={logout} style={{ fontSize: 12, color: "rgba(255,255,255,.6)", background: "transparent", border: "1px solid rgba(255,255,255,.2)", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontFamily: "inherit" }}>Sign Out</button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px" }}>

        {/* Stats bar */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
          {[
            { label: "In Queue",       value: visits.length,  color: "#0C1929", icon: "🏥" },
            { label: "Vitals Pending", value: pendingVitals,  color: "#D97706", icon: "⏳" },
            { label: "Vitals Done",    value: doneVitals,     color: "#059669", icon: "✅" },
            { label: "Urgent",         value: urgent,         color: "#DC2626", icon: "🚨" },
          ].map(s => (
            <div key={s.label} style={{ background: "#fff", borderRadius: 14, padding: "16px 18px", boxShadow: "0 1px 4px rgba(0,0,0,.06)", borderTop: `3px solid ${s.color}` }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 4, fontWeight: 600 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Doctor requests banner */}
        {requests.length > 0 && (
          <div style={{ background: "#FFFBEB", border: "1.5px solid #FCD34D", borderRadius: 12, padding: "14px 18px", marginBottom: 20, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <div style={{ fontSize: 16 }}>⚡</div>
            <span style={{ fontWeight: 700, color: "#92400E", fontSize: 13 }}>Doctor requests vitals for:</span>
            {requests.map(r => {
              const v = visits.find(x => x.id === r.visitId);
              return (
                <button key={r.visitId} onClick={() => v && openVitals(v)}
                  style={{ fontSize: 12.5, fontWeight: 700, background: "#F59E0B", color: "#fff", border: "none", borderRadius: 8, padding: "5px 14px", cursor: "pointer" }}>
                  {r.patientName} →
                </button>
              );
            })}
          </div>
        )}

        {/* Section header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0C1929" }}>
            Active Patients
            <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 500, color: "#9CA3AF" }}>— {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</span>
          </div>
        </div>

        {/* Patient cards */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#aaa", background: "#fff", borderRadius: 14 }}>Loading queue…</div>
        ) : visits.length === 0 ? (
          <div style={{ textAlign: "center", padding: "70px 0", background: "#fff", borderRadius: 16, boxShadow: "0 1px 6px rgba(0,0,0,.05)" }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>🏥</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#333", marginBottom: 6 }}>No patients in today&apos;s queue</div>
            <div style={{ fontSize: 13, color: "#aaa" }}>New patients will appear here automatically when they join.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {visits.map(v => {
              const sc         = STATUS[v.status] ?? { label: v.status, bg: "#F3F4F6", text: "#374151", dot: "#9CA3AF" };
              const isRequested= requests.some(r => r.visitId === v.id);
              const hasVitals  = !!v.vitals && Object.values(v.vitals).some(x => x !== null && x !== "");
              const isEmergency   = v.priority === "EMERGENCY";
              const isUrgent      = v.priority === "URGENT";
              const hasPendingReq = !!v.vitals?.requestedBy;
              const patAge     = age(v.patient.dateOfBirth);
              const wait       = waitTime(v.createdAt);

              const vitalChips: { label: string; value: string | number }[] = [];
              if (v.vitals?.systolicBP && v.vitals?.diastolicBP) vitalChips.push({ label: "BP", value: `${v.vitals.systolicBP}/${v.vitals.diastolicBP}` });
              if (v.vitals?.pulse)       vitalChips.push({ label: "Pulse",     value: `${v.vitals.pulse} bpm` });
              if (v.vitals?.spo2)        vitalChips.push({ label: "SpO₂",      value: `${v.vitals.spo2}%` });
              if (v.vitals?.temperature) vitalChips.push({ label: "Temp",      value: `${v.vitals.temperature}°C` });
              if (v.vitals?.bloodSugar)  vitalChips.push({ label: "Sugar",     value: `${v.vitals.bloodSugar} mg/dL` });
              if (v.vitals?.weight)      vitalChips.push({ label: "Weight",    value: `${v.vitals.weight} kg` });
              if (v.vitals?.height)      vitalChips.push({ label: "Height",    value: `${v.vitals.height} cm` });
              if (v.vitals?.hemoglobin)  vitalChips.push({ label: "Hb",        value: `${v.vitals.hemoglobin} g/dL` });
              if (v.vitals?.wbc)         vitalChips.push({ label: "WBC",       value: `${v.vitals.wbc} ×10³/μL` });
              if (v.vitals?.platelets)   vitalChips.push({ label: "Platelets", value: `${v.vitals.platelets} ×10³/μL` });
              if (v.vitals?.urineRoutine) vitalChips.push({ label: "Urine",   value: v.vitals.urineRoutine });

              return (
                <div key={v.id} style={{
                  background: "#fff",
                  borderRadius: 14,
                  border: `1.5px solid ${isRequested ? "#FCD34D" : isEmergency ? "#FECACA" : "#E8E6E3"}`,
                  boxShadow: isRequested ? "0 0 0 3px rgba(245,158,11,.15)" : "0 1px 4px rgba(0,0,0,.05)",
                  overflow: "hidden",
                }}>
                  {/* Priority stripe */}
                  {(isEmergency || isUrgent) && (
                    <div style={{ height: 4, background: isEmergency ? "#DC2626" : "#F59E0B" }} />
                  )}

                  <div style={{ padding: "16px 20px" }}>
                    {/* Top row */}
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
                      {/* Token bubble */}
                      <div style={{ minWidth: 52, height: 52, background: isRequested ? "#FEF3C7" : "#EFF6FF", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, color: isRequested ? "#92400E" : "#1D4ED8", flexShrink: 0, border: `2px solid ${isRequested ? "#FCD34D" : "#BFDBFE"}` }}>
                        {v.token}
                      </div>

                      {/* Patient info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, color: "#0C1929", fontSize: 15 }}>{v.patient.name}</span>
                          {isEmergency && <span style={{ fontSize: 11, fontWeight: 800, background: "#FEE2E2", color: "#DC2626", borderRadius: 8, padding: "2px 8px" }}>🚨 Emergency</span>}
                          {isUrgent && !isEmergency && <span style={{ fontSize: 11, fontWeight: 800, background: "#FEF3C7", color: "#D97706", borderRadius: 8, padding: "2px 8px" }}>⚡ Urgent</span>}
                        </div>
                        <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 3, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span>{v.patient.prn}</span>
                          {v.patient.gender && <span>· {v.patient.gender}</span>}
                          {patAge !== null && <span>· {patAge}y</span>}
                          {v.doctor && <span style={{ color: "#2563EB", fontWeight: 600 }}>→ {v.doctor.user.name}</span>}
                        </div>
                        {v.healthIssue && (
                          <div style={{ marginTop: 5, fontSize: 12.5, color: "#555", background: "#F8F7F5", borderRadius: 6, padding: "4px 10px", display: "inline-block" }}>
                            💬 {v.healthIssue}
                          </div>
                        )}
                      </div>

                      {/* Right side badges + button */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          {/* Status pill with dot */}
                          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20, background: sc.bg, color: sc.text }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: sc.dot, display: "inline-block" }} />
                            {sc.label}
                          </span>
                          {hasVitals && <span style={{ fontSize: 11, fontWeight: 700, background: "#D1FAE5", color: "#065F46", borderRadius: 20, padding: "4px 10px" }}>✓ Vitals</span>}
                          {isRequested && <span style={{ fontSize: 11, fontWeight: 700, background: "#FEF3C7", color: "#92400E", borderRadius: 20, padding: "4px 10px" }}>⚡ Requested</span>}
                        </div>
                        {wait && <div style={{ fontSize: 11, color: "#9CA3AF" }}>🕐 {wait}</div>}
                        <div style={{ display: "flex", gap: 6 }}>
                          {!isEmergency && (
                            <button
                              onClick={() => toggleUrgent(v)}
                              disabled={urgentLoading === v.id}
                              style={{ fontSize: 11, fontWeight: 700, padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${isUrgent ? "#F59E0B" : "#E2E0DC"}`, background: isUrgent ? "#FEF3C7" : "transparent", color: isUrgent ? "#92400E" : "#888", cursor: "pointer", whiteSpace: "nowrap" }}>
                              {isUrgent ? "⚡ Urgent" : "Mark Urgent"}
                            </button>
                          )}
                          {(!hasVitals || hasPendingReq) && (
                            <button
                              onClick={() => openVitals(v)}
                              style={{ fontSize: 12.5, fontWeight: 700, background: isRequested ? "#F59E0B" : "#0C1929", color: "#fff", border: "none", borderRadius: 9, padding: "8px 18px", cursor: "pointer", whiteSpace: "nowrap" }}>
                              {hasVitals ? "Update Vitals" : "Record Vitals"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Vitals summary row */}
                    {vitalChips.length > 0 && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #F0EEEA", display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {vitalChips.map(c => <VitalChip key={c.label} label={c.label} value={c.value} />)}
                        {v.vitals?.updatedAt && (
                          <span style={{ fontSize: 11, color: "#9CA3AF", alignSelf: "center", marginLeft: 4 }}>
                            updated {new Date(v.vitals.updatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Vitals Modal */}
      {active && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }} onClick={() => setActive(null)}>
          <div style={{ background: "#fff", borderRadius: 18, width: "100%", maxWidth: 600, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,.25)" }} onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div style={{ padding: "20px 24px 0", borderBottom: "1px solid #F0EEEA", marginBottom: 20, paddingBottom: 16, position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "#111" }}>Record Vitals</div>
                  <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>{active.patient.name} · Token {active.token} · {active.doctor?.user.name}</div>
                </div>
                <button onClick={() => setActive(null)} style={{ background: "#F3F4F6", border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 16, color: "#666" }}>✕</button>
              </div>
            </div>

            <div style={{ padding: "0 24px 24px" }}>
              {/* Required fields banner */}
              {required.length > 0 && (
                <div style={{ background: "#FEF3C7", border: "1.5px solid #FCD34D", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 12.5, color: "#92400E", fontWeight: 600 }}>
                  ⚠️ Doctor requires: {required.map(k => FIELD_LABELS[k] ?? k).join(", ")}
                </div>
              )}
              {/* Vitals grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px", marginBottom: 14 }}>
                {[
                  { key: "systolicBP",  label: "Systolic BP",  unit: "mmHg", reqKey: "bp" },
                  { key: "diastolicBP", label: "Diastolic BP", unit: "mmHg", reqKey: "bp" },
                  { key: "bloodSugar",  label: "Blood Sugar",  unit: "mg/dL", reqKey: "bloodSugar" },
                  { key: "pulse",       label: "Pulse",        unit: "bpm",  reqKey: "pulse" },
                  { key: "temperature", label: "Temperature",  unit: "°C",   reqKey: "temperature" },
                  { key: "spo2",        label: "SpO₂",         unit: "%",    reqKey: "spo2" },
                  { key: "weight",      label: "Weight",       unit: "kg",   reqKey: "weight" },
                  { key: "height",      label: "Height",       unit: "cm",   reqKey: "height" },
                  { key: "hemoglobin",  label: "Hemoglobin",   unit: "g/dL", reqKey: "hemoglobin" },
                  { key: "wbc",         label: "WBC",          unit: "×10³/μL", reqKey: "wbc" },
                  { key: "platelets",   label: "Platelets",    unit: "×10³/μL", reqKey: "platelets" },
                ].map(f => {
                  const isRequired = required.includes(f.reqKey);
                  return (
                  <div key={f.key}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: isRequired ? "#DC2626" : "#555", textTransform: "uppercase", letterSpacing: ".04em", display: "block", marginBottom: 5 }}>
                      {f.label} {isRequired && <span style={{ color: "#DC2626" }}>*</span>} <span style={{ color: "#bbb", fontWeight: 400, textTransform: "none" }}>({f.unit})</span>
                    </label>
                    <input
                      type="number"
                      value={form[f.key as keyof VitalsForm] ?? ""}
                      onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={isRequired ? "Required" : "—"}
                      style={{ ...inp, ...(isRequired && !(form[f.key as keyof VitalsForm] ?? "") ? { borderColor: "#FCA5A5", background: "#FFF5F5" } : {}) }}
                    />
                  </div>
                  );
                })}
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: required.includes("urineRoutine") ? "#DC2626" : "#555", textTransform: "uppercase", letterSpacing: ".04em", display: "block", marginBottom: 5 }}>
                  Urine Routine {required.includes("urineRoutine") && <span style={{ color: "#DC2626" }}>*</span>}
                </label>
                <input type="text" value={form.urineRoutine ?? ""} onChange={e => setForm(p => ({ ...p, urineRoutine: e.target.value }))} placeholder={required.includes("urineRoutine") ? "Required" : "e.g. Clear, no abnormalities"} style={{ ...inp, ...(required.includes("urineRoutine") && !form.urineRoutine ? { borderColor: "#FCA5A5", background: "#FFF5F5" } : {}) }} />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: ".04em", display: "block", marginBottom: 5 }}>Notes</label>
                <textarea value={form.notes ?? ""} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Any additional observations…" rows={2} style={{ ...inp, resize: "vertical" }} />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setActive(null)} style={{ flex: 1, padding: "11px", background: "transparent", border: "1.5px solid #D0CEC9", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#666" }}>Cancel</button>
                <button onClick={saveVitals} disabled={saving} style={{ flex: 2, padding: "11px", background: saving ? "#6B7280" : "#0C1929", color: "#fff", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
                  {saving ? "Saving…" : "Save Vitals"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        input::placeholder, textarea::placeholder { color: #aaa !important; opacity: 1; }
        input[type=number]::-webkit-inner-spin-button { opacity: .3; }
        @media (max-width: 640px) {
          main { padding: 14px 12px !important; }
          div[style*="grid-template-columns: repeat(4"] { grid-template-columns: repeat(2,1fr) !important; }
        }
      `}</style>
    </div>
  );
}
