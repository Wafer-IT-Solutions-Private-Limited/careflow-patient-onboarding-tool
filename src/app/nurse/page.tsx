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
}
interface Visit {
  id: string; token: string; visitId: string; status: string;
  healthIssue: string | null; priority: string;
  patient: Patient; doctor: Doctor | null; vitals: Vitals | null;
}

type VitalsForm = Partial<Record<
  "systolicBP"|"diastolicBP"|"bloodSugar"|"temperature"|"pulse"|"spo2"|
  "weight"|"height"|"hemoglobin"|"wbc"|"platelets"|"urineRoutine"|"notes",
  string
>>;

const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  WAITING:         { bg: "#FEF3C7", text: "#92400E" },
  ASSIGNED:        { bg: "#DBEAFE", text: "#1E40AF" },
  IN_CONSULTATION: { bg: "#D1FAE5", text: "#065F46" },
};

function age(dob: string | null) {
  if (!dob) return "—";
  const y = new Date().getFullYear() - new Date(dob).getFullYear();
  return `${y}y`;
}

export default function NursePage() {
  const router = useRouter();
  const [visits, setVisits]         = useState<Visit[]>([]);
  const [loading, setLoading]       = useState(true);
  const [active, setActive]         = useState<Visit | null>(null);
  const [form, setForm]             = useState<VitalsForm>({});
  const [saving, setSaving]         = useState(false);
  const [requests, setRequests]     = useState<{ visitId: string; patientName: string }[]>([]);
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

  // SSE
  useEffect(() => {
    const es = new EventSource("/api/sse");
    esRef.current = es;
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.type === "queue:updated")   load();
        if (ev.type === "visit:cancelled") load();
        if (ev.type === "vitals:requested") {
          setRequests(r => {
            if (r.find(x => x.visitId === ev.visitId)) return r;
            return [...r, { visitId: ev.visitId, patientName: ev.patientName }];
          });
          toast(`🔔 Dr. requests vitals for ${ev.patientName}`, { duration: 6000 });
          load();
        }
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [load]);

  const openVitals = (v: Visit) => {
    setActive(v);
    const ex: Vitals | null = v.vitals;
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
  };

  const saveVitals = async () => {
    if (!active) return;
    setSaving(true);
    try {
      const res = await fetch("/api/nurse/vitals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitId: active.id, ...form }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error ?? "Failed to save"); return; }
      toast.success("Vitals saved");
      // Remove from requests list
      setRequests(r => r.filter(x => x.visitId !== active.id));
      setActive(null);
      load();
    } finally { setSaving(false); }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const inp: React.CSSProperties = { padding: "9px 12px", border: "1.5px solid #E2E0DC", borderRadius: 8, fontSize: 13, outline: "none", background: "#FDFCFB", color: "#111", width: "100%" };

  return (
    <div style={{ minHeight: "100vh", background: "#F5F4F2", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif" }}>
      <Toaster position="top-right" />

      {/* Header */}
      <header style={{ background: "#0C1929", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src="/waferlogo.png" alt="Logo" style={{ height: 28, filter: "brightness(0) invert(1)" }} />
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>Nurse Station</span>
            {requests.length > 0 && (
              <span style={{ background: "#EF4444", color: "#fff", borderRadius: 10, fontSize: 11, fontWeight: 800, padding: "2px 8px" }}>
                {requests.length} request{requests.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <button onClick={logout} style={{ fontSize: 12.5, color: "rgba(255,255,255,.6)", background: "transparent", border: "1px solid rgba(255,255,255,.2)", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontFamily: "inherit" }}>
            Sign Out
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px" }}>
        {/* Doctor requests banner */}
        {requests.length > 0 && (
          <div style={{ background: "#FEF3C7", border: "1.5px solid #FCD34D", borderRadius: 12, padding: "12px 16px", marginBottom: 20, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <span style={{ fontWeight: 700, color: "#92400E", fontSize: 13 }}>⚡ Doctor requests vitals for:</span>
            {requests.map(r => {
              const v = visits.find(x => x.id === r.visitId);
              return (
                <button key={r.visitId} onClick={() => v && openVitals(v)}
                  style={{ fontSize: 12, fontWeight: 700, background: "#F59E0B", color: "#fff", border: "none", borderRadius: 8, padding: "4px 12px", cursor: "pointer" }}>
                  {r.patientName}
                </button>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#0C1929" }}>Active Queue</div>
            <div style={{ fontSize: 13, color: "#888", marginTop: 3 }}>{visits.length} patient{visits.length !== 1 ? "s" : ""} in queue</div>
          </div>
          <button onClick={load} style={{ fontSize: 13, padding: "8px 16px", background: "#fff", border: "1.5px solid #E2E0DC", borderRadius: 9, cursor: "pointer", fontWeight: 600, color: "#444" }}>Refresh</button>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#aaa" }}>Loading…</div>
        ) : visits.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "#aaa", background: "#fff", borderRadius: 14, border: "1.5px solid #E8E6E3" }}>No active patients in queue</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {visits.map(v => {
              const sc = STATUS_COLOR[v.status] ?? { bg: "#F3F4F6", text: "#374151" };
              const isRequested = requests.some(r => r.visitId === v.id);
              const hasVitals = !!v.vitals && Object.values(v.vitals).some(x => x !== null && x !== "");
              return (
                <div key={v.id} style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${isRequested ? "#FCD34D" : "#E8E6E3"}`, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  {isRequested && <div style={{ position: "absolute", width: 8, height: 8, background: "#F59E0B", borderRadius: "50%" }} />}
                  <div style={{ minWidth: 44, height: 44, background: "#EFF6FF", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, color: "#1D4ED8", flexShrink: 0 }}>{v.token}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: "#111", fontSize: 14 }}>{v.patient.name}</div>
                    <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                      {v.patient.prn} · {v.patient.gender ?? "—"} · {age(v.patient.dateOfBirth)}
                      {v.doctor && <span style={{ marginLeft: 8 }}>→ Dr. {v.doctor.user.name}</span>}
                    </div>
                    {v.healthIssue && <div style={{ fontSize: 12, color: "#666", marginTop: 3 }}>Chief Complaint: {v.healthIssue}</div>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 10, background: sc.bg, color: sc.text }}>{v.status.replace("_", " ")}</span>
                    {hasVitals && <span style={{ fontSize: 11, fontWeight: 700, background: "#D1FAE5", color: "#065F46", borderRadius: 8, padding: "2px 8px" }}>✓ Vitals</span>}
                    {isRequested && <span style={{ fontSize: 11, fontWeight: 700, background: "#FEF3C7", color: "#92400E", borderRadius: 8, padding: "2px 8px" }}>⚡ Requested</span>}
                    <button onClick={() => openVitals(v)} style={{ fontSize: 12.5, fontWeight: 700, background: "#0C1929", color: "#fff", border: "none", borderRadius: 9, padding: "7px 16px", cursor: "pointer" }}>
                      {hasVitals ? "Update Vitals" : "Record Vitals"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Vitals Modal */}
      {active && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }} onClick={() => setActive(null)}>
          <div style={{ background: "#fff", borderRadius: 18, padding: 28, width: "100%", maxWidth: 580, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.2)" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#111", marginBottom: 4 }}>Record Vitals</div>
            <div style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>{active.patient.name} · Token {active.token}</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px", marginBottom: 16 }}>
              {[
                { key: "systolicBP",  label: "Systolic BP",  unit: "mmHg", type: "number" },
                { key: "diastolicBP", label: "Diastolic BP", unit: "mmHg", type: "number" },
                { key: "bloodSugar",  label: "Blood Sugar",  unit: "mg/dL", type: "number" },
                { key: "pulse",       label: "Pulse",        unit: "bpm",   type: "number" },
                { key: "temperature", label: "Temperature",  unit: "°C",    type: "number" },
                { key: "spo2",        label: "SpO₂",         unit: "%",     type: "number" },
                { key: "weight",      label: "Weight",       unit: "kg",    type: "number" },
                { key: "height",      label: "Height",       unit: "cm",    type: "number" },
                { key: "hemoglobin",  label: "Hemoglobin",   unit: "g/dL",  type: "number" },
                { key: "wbc",         label: "WBC",          unit: "×10³/μL", type: "number" },
                { key: "platelets",   label: "Platelets",    unit: "×10³/μL", type: "number" },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: ".04em", display: "block", marginBottom: 4 }}>
                    {f.label} <span style={{ color: "#aaa", fontWeight: 400, textTransform: "none" }}>({f.unit})</span>
                  </label>
                  <input
                    type={f.type}
                    value={form[f.key as keyof VitalsForm] ?? ""}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder="—"
                    style={inp}
                  />
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: ".04em", display: "block", marginBottom: 4 }}>Urine Routine</label>
              <input type="text" value={form.urineRoutine ?? ""} onChange={e => setForm(p => ({ ...p, urineRoutine: e.target.value }))} placeholder="e.g. Clear, no abnormalities" style={inp} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: ".04em", display: "block", marginBottom: 4 }}>Notes</label>
              <textarea value={form.notes ?? ""} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Any additional observations…" rows={2} style={{ ...inp, resize: "vertical" }} />
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setActive(null)} style={{ flex: 1, padding: "10px", background: "transparent", border: "1.5px solid #D0CEC9", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#666" }}>Cancel</button>
              <button onClick={saveVitals} disabled={saving} style={{ flex: 2, padding: "10px", background: saving ? "#6B7280" : "#0C1929", color: "#fff", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
                {saving ? "Saving…" : "Save Vitals"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        input::placeholder, textarea::placeholder { color: #aaa !important; opacity: 1; }
        input[type=number]::-webkit-inner-spin-button { opacity: .4; }
        @media (max-width: 600px) {
          main { padding: 16px 14px !important; }
        }
      `}</style>
    </div>
  );
}
