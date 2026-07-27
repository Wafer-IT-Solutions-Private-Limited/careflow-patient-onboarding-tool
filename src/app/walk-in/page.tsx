"use client";

import { useState } from "react";
import toast from "react-hot-toast";

type Step = "lookup" | "new" | "confirm";

interface PatientResult {
  id: string; prn: string; name: string; gender?: string; phone?: string;
  visits?: { id: string; token: string; status: string; visitDate: string }[];
}

export default function WalkInPage() {
  const [step, setStep] = useState<Step>("lookup");
  const [prn, setPrn] = useState("");
  const [patient, setPatient] = useState<PatientResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [visitResult, setVisitResult] = useState<{ token: string; visitId: string; doctorName?: string } | null>(null);

  // New patient form
  const [form, setForm] = useState({
    name: "", dateOfBirth: "", gender: "", phone: "",
    address: "", city: "", state: "", pincode: "",
    healthIssues: "", paymentType: "GENERAL", priority: "NORMAL",
  });

  const lookupPRN = async () => {
    if (!prn.trim()) { toast.error("Enter a PRN"); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/patients/prn-lookup?prn=${encodeURIComponent(prn.trim())}`);
      if (res.status === 404) { toast.error("PRN not found. Register as new patient."); setStep("new"); return; }
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      setPatient(data.patient);
      setStep("confirm");
    } finally { setLoading(false); }
  };

  const registerAndQueue = async (patientId: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/visits", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, priority: "NORMAL" }),
      });
      const data = await res.json();
      if (res.status === 409) { toast.error(data.error); return; }
      if (!res.ok) { toast.error(data.error ?? "Failed to create visit"); return; }
      setVisitResult({
        token:      data.visit.token,
        visitId:    data.visit.visitId,
        doctorName: data.visit.doctor?.user?.name,
      });
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
      if (!res.ok) { toast.error(data.error ?? "Failed to register patient"); return; }
      toast.success(`Patient registered — PRN: ${data.patient.prn}`);
      await registerAndQueue(data.patient.id);
    } finally { setLoading(false); }
  };

  if (visitResult) {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.successIcon}>✓</div>
          <h2 style={S.successTitle}>Patient Queued Successfully</h2>
          <div style={S.tokenBox}>
            <span style={S.tokenLabel}>Queue Token</span>
            <span style={S.tokenValue}>{visitResult.token}</span>
          </div>
          <div style={S.infoRow}><span style={S.infoLabel}>Visit ID</span><span style={S.infoVal}>{visitResult.visitId}</span></div>
          {visitResult.doctorName && (
            <div style={S.infoRow}><span style={S.infoLabel}>Assigned Doctor</span><span style={S.infoVal}>{visitResult.doctorName}</span></div>
          )}
          <button style={S.btn} onClick={() => { setStep("lookup"); setPrn(""); setPatient(null); setVisitResult(null); }}>
            Register Another Patient
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <h1 style={S.title}>Walk-In Registration</h1>
        <p style={S.sub}>Look up an existing patient by PRN or register a new one.</p>

        {/* Lookup */}
        {(step === "lookup" || step === "new") && (
          <div style={S.section}>
            <label style={S.label}>Patient Reference Number (PRN)</label>
            <div style={S.row}>
              <input
                style={S.input} placeholder="PAT-YYYYMMDD-XXXX"
                value={prn} onChange={e => setPrn(e.target.value)}
                onKeyDown={e => e.key === "Enter" && lookupPRN()}
              />
              <button style={S.btn} onClick={lookupPRN} disabled={loading}>
                {loading ? "…" : "Look Up"}
              </button>
            </div>
          </div>
        )}

        {/* Existing patient confirm */}
        {step === "confirm" && patient && (
          <div>
            <div style={S.patientCard}>
              <div style={S.patientName}>{patient.name}</div>
              <div style={S.patientMeta}>PRN: {patient.prn}</div>
              {patient.gender && <div style={S.patientMeta}>Gender: {patient.gender}</div>}
              {patient.phone  && <div style={S.patientMeta}>Phone: {patient.phone}</div>}
            </div>
            <div style={S.btnRow}>
              <button style={S.btnSecondary} onClick={() => { setPatient(null); setStep("lookup"); }}>
                ← Back
              </button>
              <button style={S.btn} onClick={() => registerAndQueue(patient.id)} disabled={loading}>
                {loading ? "Queuing…" : "Add to Queue"}
              </button>
            </div>
          </div>
        )}

        {/* New patient form */}
        {step === "new" && (
          <div>
            <div style={S.divider}><span style={S.dividerText}>New Patient Registration</span></div>
            <div style={S.grid2}>
              <div style={S.field}>
                <label style={S.label}>Full Name *</label>
                <input style={S.input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" />
              </div>
              <div style={S.field}>
                <label style={S.label}>Date of Birth</label>
                <input style={S.input} type="date" value={form.dateOfBirth} onChange={e => setForm(f => ({ ...f, dateOfBirth: e.target.value }))} />
              </div>
              <div style={S.field}>
                <label style={S.label}>Gender</label>
                <select style={S.input} value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
                  <option value="">Select</option>
                  <option>Male</option><option>Female</option><option>Other</option>
                </select>
              </div>
              <div style={S.field}>
                <label style={S.label}>Phone</label>
                <input style={S.input} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="10-digit number" />
              </div>
              <div style={{ ...S.field, gridColumn: "1 / -1" }}>
                <label style={S.label}>Address</label>
                <input style={S.input} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Street address" />
              </div>
              <div style={S.field}>
                <label style={S.label}>City</label>
                <input style={S.input} value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
              </div>
              <div style={S.field}>
                <label style={S.label}>Pincode</label>
                <input style={S.input} value={form.pincode} onChange={e => setForm(f => ({ ...f, pincode: e.target.value }))} />
              </div>
              <div style={{ ...S.field, gridColumn: "1 / -1" }}>
                <label style={S.label}>Health Issues / Chief Complaint</label>
                <textarea style={{ ...S.input, minHeight: 72, resize: "vertical" }}
                  value={form.healthIssues} onChange={e => setForm(f => ({ ...f, healthIssues: e.target.value }))}
                  placeholder="Describe symptoms or reason for visit" />
              </div>
              <div style={S.field}>
                <label style={S.label}>Payment Type</label>
                <select style={S.input} value={form.paymentType} onChange={e => setForm(f => ({ ...f, paymentType: e.target.value }))}>
                  <option value="GENERAL">General</option>
                  <option value="INSURANCE">Insurance</option>
                  <option value="CASHLESS">Cashless</option>
                </select>
              </div>
              <div style={S.field}>
                <label style={S.label}>Priority</label>
                <select style={S.input} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                  <option value="NORMAL">Normal</option>
                  <option value="URGENT">Urgent</option>
                  <option value="EMERGENCY">Emergency</option>
                </select>
              </div>
            </div>
            <div style={S.btnRow}>
              <button style={S.btnSecondary} onClick={() => setStep("lookup")}>← Back</button>
              <button style={S.btn} onClick={createNewPatient} disabled={loading}>
                {loading ? "Registering…" : "Register & Add to Queue"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page:         { minHeight: "100vh", background: "#F5F4F2", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif" },
  card:         { background: "#fff", borderRadius: 16, padding: "36px 40px", width: "100%", maxWidth: 680, boxShadow: "0 2px 24px rgba(0,0,0,.07)" },
  title:        { fontSize: 24, fontWeight: 700, color: "#0C1929", marginBottom: 6 },
  sub:          { fontSize: 13.5, color: "#888", marginBottom: 28 },
  section:      { marginBottom: 24 },
  label:        { display: "block", fontSize: 11, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: "#666", marginBottom: 6 },
  input:        { width: "100%", padding: "10px 14px", border: "1.5px solid #E2E0DC", borderRadius: 9, fontSize: 14, color: "#111", background: "#FDFCFB", outline: "none", boxSizing: "border-box" },
  row:          { display: "flex", gap: 10 },
  btn:          { padding: "10px 22px", background: "#0C1929", color: "#fff", border: "none", borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  btnSecondary: { padding: "10px 22px", background: "transparent", color: "#0C1929", border: "1.5px solid #0C1929", borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  btnRow:       { display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 },
  patientCard:  { background: "#F5F8FF", border: "1.5px solid #C8D8F0", borderRadius: 12, padding: "16px 20px", marginBottom: 20 },
  patientName:  { fontSize: 18, fontWeight: 700, color: "#0C1929", marginBottom: 4 },
  patientMeta:  { fontSize: 13, color: "#555", marginBottom: 2 },
  divider:      { display: "flex", alignItems: "center", margin: "24px 0 20px", gap: 12 },
  dividerText:  { fontSize: 13, fontWeight: 600, color: "#888", whiteSpace: "nowrap" },
  grid2:        { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 16px" },
  field:        { display: "flex", flexDirection: "column" },
  successIcon:  { width: 56, height: 56, background: "#0C1929", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, color: "#fff", margin: "0 auto 20px" },
  successTitle: { textAlign: "center", fontSize: 20, fontWeight: 700, color: "#0C1929", marginBottom: 24 },
  tokenBox:     { background: "#F0F4FF", border: "2px solid #0C1929", borderRadius: 12, padding: "20px 28px", textAlign: "center", marginBottom: 20 },
  tokenLabel:   { display: "block", fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#666", marginBottom: 8 },
  tokenValue:   { display: "block", fontSize: 48, fontWeight: 800, color: "#0C1929", letterSpacing: "-.5px" },
  infoRow:      { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #eee", marginBottom: 4 },
  infoLabel:    { fontSize: 13, color: "#888" },
  infoVal:      { fontSize: 13, fontWeight: 600, color: "#0C1929" },
};
