"use client";

import { useState } from "react";
import toast from "react-hot-toast";

type Step = "home" | "lookup" | "new" | "confirm";

interface PatientResult {
  id: string; prn: string; name: string; gender?: string; phone?: string;
  visits?: { id: string; token: string; status: string; visitDate: string; visitId: string }[];
}

export default function WalkInPage() {
  const [step, setStep]               = useState<Step>("home");
  const [lookupMode, setLookupMode]   = useState<"prn" | "aadhaar">("prn");
  const [lookupVal, setLookupVal]     = useState("");
  const [patient, setPatient]         = useState<PatientResult | null>(null);
  const [loading, setLoading]         = useState(false);
  const [visitResult, setVisitResult] = useState<{ token: string; visitId: string; doctorName?: string; prn?: string; tempPassword?: string } | null>(null);

  const [form, setForm] = useState({
    name: "", dateOfBirth: "", gender: "", phone: "", aadhaar: "",
    address: "", city: "", state: "", pincode: "",
    healthIssues: "", paymentType: "GENERAL", priority: "NORMAL",
  });

  const lookup = async () => {
    if (!lookupVal.trim()) { toast.error(`Enter a ${lookupMode === "prn" ? "PRN" : "Aadhaar number"}`); return; }
    setLoading(true);
    try {
      const param = lookupMode === "prn"
        ? `prn=${encodeURIComponent(lookupVal.trim())}`
        : `aadhaar=${encodeURIComponent(lookupVal.trim().replace(/\s/g, ""))}`;
      const res = await fetch(`/api/walk-in/lookup?${param}`);
      if (res.status === 404) {
        toast.error("Patient not found. Register as a new patient.");
        setStep("new");
        return;
      }
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      setPatient(data.patient);
      setStep("confirm");
    } finally { setLoading(false); }
  };

  const addToQueue = async (patientId: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/visits", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, priority: "NORMAL" }),
      });
      const data = await res.json();
      if (res.status === 409) { toast.error(data.error); return; }
      if (!res.ok) { toast.error(data.error ?? "Failed to create visit"); return; }
      setVisitResult({ token: data.visit.token, visitId: data.visit.visitId, doctorName: data.visit.doctor?.user?.name });
    } finally { setLoading(false); }
  };

  const createNewPatient = async () => {
    if (!form.name.trim()) { toast.error("Patient name is required"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/patients", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      // Duplicate Aadhaar — offer to add existing patient to queue
      if (res.status === 409 && data.patient) {
        toast.error("Aadhaar already registered. Adding existing patient to queue.");
        await addToQueue(data.patient.id);
        return;
      }
      if (!res.ok) { toast.error(data.error ?? "Failed to register patient"); return; }
      toast.success(`Patient registered — PRN: ${data.patient.prn}`);
      const queueRes = await fetch("/api/visits", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: data.patient.id, priority: form.priority }),
      });
      const queueData = await queueRes.json();
      if (!queueRes.ok) { toast.error(queueData.error ?? "Registered but failed to queue"); return; }
      setVisitResult({
        token:      queueData.visit.token,
        visitId:    queueData.visit.visitId,
        doctorName: queueData.visit.doctor?.user?.name,
        prn:        data.patient.prn,
      });
    } finally { setLoading(false); }
  };

  const reset = () => { setStep("home"); setLookupVal(""); setPatient(null); setVisitResult(null); setForm({ name: "", dateOfBirth: "", gender: "", phone: "", aadhaar: "", address: "", city: "", state: "", pincode: "", healthIssues: "", paymentType: "GENERAL", priority: "NORMAL" }); };

  // ── Success screen ──────────────────────────────────────────────────────────
  if (visitResult) {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.successIcon}>✓</div>
          <h2 style={S.successTitle}>Patient Queued Successfully</h2>
          {visitResult.prn && (
            <div style={{ ...S.infoRow, background: "#F0F4FF", padding: "10px 16px", borderRadius: 10, marginBottom: 16 }}>
              <span style={S.infoLabel}>PRN (save this)</span>
              <span style={{ ...S.infoVal, fontWeight: 800, color: "#0C1929" }}>{visitResult.prn}</span>
            </div>
          )}
          <div style={S.tokenBox}>
            <span style={S.tokenLabel}>Queue Token</span>
            <span style={S.tokenValue}>{visitResult.token}</span>
          </div>
          <div style={S.infoRow}><span style={S.infoLabel}>Visit ID</span><span style={S.infoVal}>{visitResult.visitId}</span></div>
          {visitResult.doctorName && <div style={S.infoRow}><span style={S.infoLabel}>Assigned Doctor</span><span style={S.infoVal}>{visitResult.doctorName}</span></div>}
          <button style={S.btn} onClick={reset}>Register Another Patient</button>
        </div>
      </div>
    );
  }

  // ── Home screen ─────────────────────────────────────────────────────────────
  if (step === "home") {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <h1 style={S.title}>Walk-In Registration</h1>
          <p style={S.sub}>Look up a returning patient or register a new one.</p>
          <div style={S.homeGrid}>
            <button style={S.homeCard} onClick={() => setStep("lookup")}>
              <span style={S.homeIcon}>🔍</span>
              <span style={S.homeCardTitle}>Returning Patient</span>
              <span style={S.homeCardSub}>Look up by PRN or Aadhaar</span>
            </button>
            <button style={{ ...S.homeCard, background: "#0C1929", borderColor: "#0C1929" }} onClick={() => setStep("new")}>
              <span style={S.homeIcon}>➕</span>
              <span style={{ ...S.homeCardTitle, color: "#fff" }}>Onboard New Patient</span>
              <span style={{ ...S.homeCardSub, color: "rgba(255,255,255,.65)" }}>Register & add to queue</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Lookup screen ───────────────────────────────────────────────────────────
  if (step === "lookup") {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <button style={S.back} onClick={() => { setStep("home"); setLookupVal(""); }}>← Back</button>
          <h1 style={S.title}>Find Returning Patient</h1>

          <div style={S.tabRow}>
            <button style={{ ...S.tab, ...(lookupMode === "prn" ? S.tabActive : {}) }} onClick={() => setLookupMode("prn")}>By PRN</button>
            <button style={{ ...S.tab, ...(lookupMode === "aadhaar" ? S.tabActive : {}) }} onClick={() => setLookupMode("aadhaar")}>By Aadhaar</button>
          </div>

          <div style={S.row}>
            <input
              style={S.input}
              placeholder={lookupMode === "prn" ? "PAT-YYYYMMDD-XXXX" : "12-digit Aadhaar number"}
              value={lookupVal}
              onChange={e => setLookupVal(e.target.value)}
              onKeyDown={e => e.key === "Enter" && lookup()}
            />
            <button style={S.btn} onClick={lookup} disabled={loading}>{loading ? "…" : "Search"}</button>
          </div>

          <p style={S.orText}>Patient not in system? <button style={S.linkBtn} onClick={() => setStep("new")}>Register new patient →</button></p>
        </div>
      </div>
    );
  }

  // ── Confirm existing patient ─────────────────────────────────────────────────
  if (step === "confirm" && patient) {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <button style={S.back} onClick={() => { setPatient(null); setStep("lookup"); }}>← Back</button>
          <h1 style={S.title}>Confirm Patient</h1>
          <div style={S.patientCard}>
            <div style={S.patientName}>{patient.name}</div>
            <div style={S.patientMeta}>PRN: {patient.prn}</div>
            {patient.gender && <div style={S.patientMeta}>Gender: {patient.gender}</div>}
            {patient.phone  && <div style={S.patientMeta}>Phone: {patient.phone}</div>}
            {patient.visits && patient.visits.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", marginBottom: 6 }}>Recent Visits</div>
                {patient.visits.slice(0, 2).map(v => (
                  <div key={v.id} style={{ fontSize: 12, color: "#666", marginBottom: 2 }}>
                    {new Date(v.visitDate).toLocaleDateString("en-IN")} — Token {v.token} — {v.status}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={S.btnRow}>
            <button style={S.btnSecondary} onClick={() => { setPatient(null); setStep("lookup"); }}>← Back</button>
            <button style={S.btn} onClick={() => addToQueue(patient.id)} disabled={loading}>{loading ? "Queuing…" : "Add to Queue"}</button>
          </div>
        </div>
      </div>
    );
  }

  // ── New patient form ─────────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <div style={S.card}>
        <button style={S.back} onClick={() => setStep("home")}>← Back</button>
        <h1 style={S.title}>Register New Patient</h1>
        <div style={S.grid2}>
          <div style={S.field}><label style={S.label}>Full Name *</label><input style={S.input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div style={S.field}><label style={S.label}>Date of Birth</label><input style={S.input} type="date" value={form.dateOfBirth} onChange={e => setForm(f => ({ ...f, dateOfBirth: e.target.value }))} /></div>
          <div style={S.field}><label style={S.label}>Gender</label>
            <select style={S.input} value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
              <option value="">Select</option><option>Male</option><option>Female</option><option>Other</option>
            </select>
          </div>
          <div style={S.field}><label style={S.label}>Phone</label><input style={S.input} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="10-digit" /></div>
          <div style={{ ...S.field, gridColumn: "1 / -1" }}>
            <label style={S.label}>Aadhaar Number <span style={{ fontWeight: 400, color: "#aaa" }}>(optional — for duplicate detection)</span></label>
            <input style={S.input} value={form.aadhaar} onChange={e => setForm(f => ({ ...f, aadhaar: e.target.value }))} placeholder="1234 5678 9012" maxLength={14} />
          </div>
          <div style={{ ...S.field, gridColumn: "1 / -1" }}><label style={S.label}>Address</label><input style={S.input} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
          <div style={S.field}><label style={S.label}>City</label><input style={S.input} value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></div>
          <div style={S.field}><label style={S.label}>Pincode</label><input style={S.input} value={form.pincode} onChange={e => setForm(f => ({ ...f, pincode: e.target.value }))} /></div>
          <div style={{ ...S.field, gridColumn: "1 / -1" }}>
            <label style={S.label}>Chief Complaint</label>
            <textarea style={{ ...S.input, minHeight: 72, resize: "vertical" }} value={form.healthIssues} onChange={e => setForm(f => ({ ...f, healthIssues: e.target.value }))} placeholder="Reason for visit" />
          </div>
          <div style={S.field}><label style={S.label}>Payment Type</label>
            <select style={S.input} value={form.paymentType} onChange={e => setForm(f => ({ ...f, paymentType: e.target.value }))}>
              <option value="GENERAL">General</option><option value="INSURANCE">Insurance</option><option value="CASHLESS">Cashless</option>
            </select>
          </div>
          <div style={S.field}><label style={S.label}>Priority</label>
            <select style={S.input} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
              <option value="NORMAL">Normal</option><option value="URGENT">Urgent</option><option value="EMERGENCY">Emergency</option>
            </select>
          </div>
        </div>
        <div style={S.btnRow}>
          <button style={S.btnSecondary} onClick={() => setStep("home")}>← Back</button>
          <button style={S.btn} onClick={createNewPatient} disabled={loading}>{loading ? "Registering…" : "Register & Add to Queue"}</button>
        </div>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page:         { minHeight: "100vh", background: "#F5F4F2", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif" },
  card:         { background: "#fff", borderRadius: 16, padding: "36px 40px", width: "100%", maxWidth: 680, boxShadow: "0 2px 24px rgba(0,0,0,.07)" },
  title:        { fontSize: 24, fontWeight: 700, color: "#0C1929", marginBottom: 6 },
  sub:          { fontSize: 13.5, color: "#888", marginBottom: 28 },
  back:         { background: "none", border: "none", fontSize: 13, color: "#666", cursor: "pointer", padding: "0 0 16px", fontWeight: 600 },
  homeGrid:     { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 8 },
  homeCard:     { background: "#F8F7F5", border: "1.5px solid #E2E0DC", borderRadius: 14, padding: "28px 20px", cursor: "pointer", textAlign: "center" as const, display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 8 },
  homeIcon:     { fontSize: 28, marginBottom: 4 },
  homeCardTitle:{ fontSize: 16, fontWeight: 700, color: "#0C1929" },
  homeCardSub:  { fontSize: 12, color: "#888" },
  tabRow:       { display: "flex", gap: 8, marginBottom: 20, borderBottom: "1.5px solid #E2E0DC", paddingBottom: 12 },
  tab:          { background: "none", border: "none", fontSize: 14, fontWeight: 600, color: "#888", cursor: "pointer", padding: "6px 14px", borderRadius: 8 },
  tabActive:    { background: "#0C1929", color: "#fff" },
  label:        { display: "block", fontSize: 11, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase" as const, color: "#666", marginBottom: 6 },
  input:        { width: "100%", padding: "10px 14px", border: "1.5px solid #E2E0DC", borderRadius: 9, fontSize: 14, color: "#111", background: "#FDFCFB", outline: "none", boxSizing: "border-box" as const },
  row:          { display: "flex", gap: 10, marginBottom: 16 },
  btn:          { padding: "10px 22px", background: "#0C1929", color: "#fff", border: "none", borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" as const },
  btnSecondary: { padding: "10px 22px", background: "transparent", color: "#0C1929", border: "1.5px solid #0C1929", borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  btnRow:       { display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 },
  orText:       { fontSize: 13, color: "#888", marginTop: 12 },
  linkBtn:      { background: "none", border: "none", color: "#0C1929", fontWeight: 700, cursor: "pointer", fontSize: 13 },
  patientCard:  { background: "#F5F8FF", border: "1.5px solid #C8D8F0", borderRadius: 12, padding: "16px 20px", marginBottom: 20 },
  patientName:  { fontSize: 18, fontWeight: 700, color: "#0C1929", marginBottom: 4 },
  patientMeta:  { fontSize: 13, color: "#555", marginBottom: 2 },
  grid2:        { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 16px" },
  field:        { display: "flex", flexDirection: "column" as const },
  successIcon:  { width: 56, height: 56, background: "#0C1929", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, color: "#fff", margin: "0 auto 20px" },
  successTitle: { textAlign: "center" as const, fontSize: 20, fontWeight: 700, color: "#0C1929", marginBottom: 24 },
  tokenBox:     { background: "#F0F4FF", border: "2px solid #0C1929", borderRadius: 12, padding: "20px 28px", textAlign: "center" as const, marginBottom: 20 },
  tokenLabel:   { display: "block", fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase" as const, color: "#666", marginBottom: 8 },
  tokenValue:   { display: "block", fontSize: 48, fontWeight: 800, color: "#0C1929", letterSpacing: "-.5px" },
  infoRow:      { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #eee", marginBottom: 4 },
  infoLabel:    { fontSize: 13, color: "#888" },
  infoVal:      { fontSize: 13, fontWeight: 600, color: "#0C1929" },
};
