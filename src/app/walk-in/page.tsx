"use client";

import { useState, lazy, Suspense } from "react";
import toast from "react-hot-toast";

const AadhaarScanner = lazy(() => import("@/components/AadhaarScanner"));

type Step = "home" | "lookup" | "new" | "confirm";

interface PatientResult {
  id: string; prn: string; name: string; gender?: string; phone?: string;
  visits?: { id: string; token: string; status: string; visitDate: string; visitId: string }[];
}

const PAYMENT_OPTIONS = [
  { value: "Cash",                      label: "Cash" },
  { value: "UPI",                       label: "UPI" },
  { value: "Net Banking",               label: "Net Banking" },
  { value: "Debit or Credit Card",      label: "Debit or Credit Card" },
  { value: "Insurance Cashless Claims", label: "Insurance Cashless Claims" },
];

export default function WalkInPage() {
  const [step, setStep]             = useState<Step>("home");
  const [lookupMode, setLookupMode] = useState<"prn" | "aadhaar" | "phone">("prn");
  const [lookupVal, setLookupVal]   = useState("");
  const [patient, setPatient]       = useState<PatientResult | null>(null);
  const [loading, setLoading]       = useState(false);
  const [visitResult, setVisitResult] = useState<{ token: string; visitId: string; doctorName?: string; prn?: string; tempPassword?: string } | null>(null);
  const [visitPaymentType, setVisitPaymentType] = useState("Cash");

  const [showScanner, setShowScanner] = useState(false);

  const [form, setForm] = useState({
    name: "", dateOfBirth: "", gender: "", phone: "", aadhaar: "",
    address: "", city: "", state: "", pincode: "",
    healthIssues: "", priority: "NORMAL",
  });

  const lookup = async () => {
    if (!lookupVal.trim()) { toast.error(`Enter a ${lookupMode === "prn" ? "PRN" : lookupMode === "aadhaar" ? "Aadhaar number" : "phone number"}`); return; }
    setLoading(true);
    try {
      const param = lookupMode === "prn"
        ? `prn=${encodeURIComponent(lookupVal.trim())}`
        : lookupMode === "phone"
          ? `phone=${encodeURIComponent(lookupVal.trim())}`
          : `aadhaar=${encodeURIComponent(lookupVal.trim().replace(/\s/g, ""))}`;
      const res = await fetch(`/api/walk-in/lookup?${param}`);
      if (res.status === 404) { toast.error("Patient not found. Register as a new patient."); setStep("new"); return; }
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
        body: JSON.stringify({ patientId, priority: "NORMAL", paymentType: visitPaymentType }),
      });
      const data = await res.json();
      if (res.status === 409) { toast.error(data.error); return; }
      if (!res.ok) { toast.error(data.error ?? "Failed to create visit"); return; }
      setVisitResult({ token: data.visit.token, visitId: data.visit.visitId, doctorName: data.visit.doctor?.user?.name });
    } finally { setLoading(false); }
  };

  const createNewPatient = async () => {
    if (!form.name.trim())        { toast.error("Patient name is required"); return; }
    if (!form.phone.trim())       { toast.error("Phone number is required"); return; }
    if (!form.dateOfBirth)        { toast.error("Date of birth is required"); return; }
    if (!form.gender)             { toast.error("Gender is required"); return; }
    if (!form.aadhaar.trim())     { toast.error("Aadhaar number is required"); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/patients", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.status === 409 && data.patient) {
        toast.error("Patient already registered. Adding to queue.");
        await addToQueue(data.patient.id);
        return;
      }
      if (!res.ok) { toast.error(data.error ?? "Failed to register patient"); return; }
      toast.success(`Patient registered — PRN: ${data.patient.prn}`);

      const queueRes = await fetch("/api/visits", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: data.patient.id, priority: form.priority, paymentType: visitPaymentType }),
      });
      const queueData = await queueRes.json();
      if (!queueRes.ok) { toast.error(queueData.error ?? "Registered but failed to queue"); return; }
      setVisitResult({
        token:        queueData.visit.token,
        visitId:      queueData.visit.visitId,
        doctorName:   queueData.visit.doctor?.user?.name,
        prn:          data.patient.prn,
        tempPassword: data.tempPassword,
      });
    } finally { setLoading(false); }
  };

  const reset = () => {
    setStep("home"); setLookupVal(""); setPatient(null); setVisitResult(null);
    setVisitPaymentType("Cash");
    setForm({ name: "", dateOfBirth: "", gender: "", phone: "", aadhaar: "", address: "", city: "", state: "", pincode: "", healthIssues: "", priority: "NORMAL" });
  };

  // ── Success screen ──────────────────────────────────────────────────────────
  if (visitResult) {
    return (
      <div style={S.page}>
        <div className="wi-card" style={S.card}>
          <div style={S.successIcon}>✓</div>
          <h2 style={S.successTitle}>Patient Queued Successfully</h2>
          {visitResult.prn && (
            <div style={{ background: "#F0F4FF", padding: "10px 16px", borderRadius: 10, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={S.infoLabel}>PRN (save this)</span>
                <span style={{ ...S.infoVal, fontWeight: 800, color: "#0C1929" }}>{visitResult.prn}</span>
              </div>
            </div>
          )}
          {visitResult.tempPassword && (
            <div style={{ background: "#FFF7ED", border: "1.5px solid #FCD34D", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".06em", color: "#92400E", marginBottom: 6 }}>Temporary Password — Hand to Patient</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#92400E", letterSpacing: 2 }}>{visitResult.tempPassword}</div>
              <div style={{ fontSize: 11, color: "#B45309", marginTop: 6 }}>Patient can log in using their phone number and this password. They will be prompted to change it on first login.</div>
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
        <WalkInStyles />
      </div>
    );
  }

  // ── Home screen ─────────────────────────────────────────────────────────────
  if (step === "home") {
    return (
      <div style={S.page}>
        <div className="wi-card" style={S.card}>
          <h1 style={S.title}>Walk-In Registration</h1>
          <p style={S.sub}>Look up a returning patient or register a new one.</p>
          <div className="wi-home-grid" style={S.homeGrid}>
            <button style={S.homeCard} onClick={() => setStep("lookup")}>
              <span style={S.homeIcon}>🔍</span>
              <span style={S.homeCardTitle}>Returning Patient</span>
              <span style={S.homeCardSub}>Look up by PRN, Phone or Aadhaar</span>
            </button>
            <button style={{ ...S.homeCard, background: "#0C1929", borderColor: "#0C1929" }} onClick={() => setStep("new")}>
              <span style={S.homeIcon}>➕</span>
              <span style={{ ...S.homeCardTitle, color: "#fff" }}>Onboard New Patient</span>
              <span style={{ ...S.homeCardSub, color: "rgba(255,255,255,.65)" }}>Register & add to queue</span>
            </button>
          </div>
        </div>
        <WalkInStyles />
      </div>
    );
  }

  // ── Lookup screen ───────────────────────────────────────────────────────────
  if (step === "lookup") {
    return (
      <div style={S.page}>
        <div className="wi-card" style={S.card}>
          <button style={S.back} onClick={() => { setStep("home"); setLookupVal(""); }}>← Back</button>
          <h1 style={S.title}>Find Returning Patient</h1>
          <div style={S.tabRow}>
            {(["prn","phone","aadhaar"] as const).map(m => (
              <button key={m} style={{ ...S.tab, ...(lookupMode === m ? S.tabActive : {}) }} onClick={() => setLookupMode(m)}>
                {m === "prn" ? "By PRN" : m === "phone" ? "By Phone" : "By Aadhaar"}
              </button>
            ))}
          </div>
          <div className="wi-row" style={S.row}>
            <input
              style={S.input}
              placeholder={lookupMode === "prn" ? "PAT-YYYYMMDD-XXXX" : lookupMode === "phone" ? "10-digit phone number" : "12-digit Aadhaar number"}
              value={lookupVal}
              onChange={e => setLookupVal(e.target.value)}
              onKeyDown={e => e.key === "Enter" && lookup()}
            />
            <button style={S.btn} onClick={lookup} disabled={loading}>{loading ? "…" : "Search"}</button>
          </div>
          <p style={S.orText}>Patient not in system? <button style={S.linkBtn} onClick={() => setStep("new")}>Register new patient →</button></p>
        </div>
        <WalkInStyles />
      </div>
    );
  }

  // ── Confirm existing patient ─────────────────────────────────────────────────
  if (step === "confirm" && patient) {
    return (
      <div style={S.page}>
        <div className="wi-card" style={S.card}>
          <button style={S.back} onClick={() => { setPatient(null); setStep("lookup"); }}>← Back</button>
          <h1 style={S.title}>Confirm Patient</h1>
          <div style={S.patientCard}>
            <div style={S.patientName}>{patient.name}</div>
            <div style={S.patientMeta}>PRN: {patient.prn}</div>
            {patient.gender && <div style={S.patientMeta}>Gender: {patient.gender}</div>}
            {patient.phone  && <div style={S.patientMeta}>Phone: {patient.phone}</div>}
            {patient.visits && patient.visits.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase" as const, marginBottom: 6 }}>Recent Visits</div>
                {patient.visits.slice(0, 2).map(v => (
                  <div key={v.id} style={{ fontSize: 12, color: "#666", marginBottom: 2 }}>
                    {new Date(v.visitDate).toLocaleDateString("en-IN")} — Token {v.token} — {v.status}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={S.field}>
            <label style={S.label}>Payment Type *</label>
            <select style={S.input} value={visitPaymentType} onChange={e => setVisitPaymentType(e.target.value)}>
              {PAYMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="wi-btn-row" style={S.btnRow}>
            <button style={S.btnSecondary} onClick={() => { setPatient(null); setStep("lookup"); }}>← Back</button>
            <button style={S.btn} onClick={() => addToQueue(patient.id)} disabled={loading}>{loading ? "Queuing…" : "Add to Queue"}</button>
          </div>
        </div>
        <WalkInStyles />
      </div>
    );
  }

  // ── New patient form ─────────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <div className="wi-card" style={S.card}>
        <button style={S.back} onClick={() => setStep("home")}>← Back</button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <h1 style={{ ...S.title, marginBottom: 0 }}>Register New Patient</h1>
          <button style={S.scanBtn} onClick={() => setShowScanner(true)}>
            📷 Scan Aadhaar
          </button>
        </div>
        <p style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>All fields marked * are required. Use Scan Aadhaar to auto-fill.</p>
        <div className="wi-grid2" style={S.grid2}>
          <div style={S.field}><label style={S.label}>Full Name *</label><input style={S.input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full legal name" /></div>
          <div style={S.field}><label style={S.label}>Date of Birth *</label><input style={S.input} type="date" value={form.dateOfBirth} onChange={e => setForm(f => ({ ...f, dateOfBirth: e.target.value }))} /></div>
          <div style={S.field}><label style={S.label}>Gender *</label>
            <select style={S.input} value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
              <option value="">Select</option><option>Male</option><option>Female</option><option>Other</option>
            </select>
          </div>
          <div style={S.field}><label style={S.label}>Phone *</label><input style={S.input} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="10-digit mobile" /></div>
          <div style={{ ...S.field, gridColumn: "1 / -1" }}>
            <label style={S.label}>Aadhaar Number *</label>
            <input style={S.input} value={form.aadhaar} onChange={e => setForm(f => ({ ...f, aadhaar: e.target.value }))} placeholder="1234 5678 9012" maxLength={14} />
          </div>
          <div style={{ ...S.field, gridColumn: "1 / -1" }}><label style={S.label}>Address</label><input style={S.input} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
          <div style={S.field}><label style={S.label}>City</label><input style={S.input} value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></div>
          <div style={S.field}><label style={S.label}>Pincode</label><input style={S.input} value={form.pincode} onChange={e => setForm(f => ({ ...f, pincode: e.target.value }))} /></div>
          <div style={{ ...S.field, gridColumn: "1 / -1" }}>
            <label style={S.label}>Patient Reported Symptoms</label>
            <textarea style={{ ...S.input, minHeight: 72, resize: "vertical" }} value={form.healthIssues} onChange={e => setForm(f => ({ ...f, healthIssues: e.target.value }))} placeholder="Reason for visit / presenting complaint" />
          </div>
          <div style={S.field}><label style={S.label}>Payment Type *</label>
            <select style={S.input} value={visitPaymentType} onChange={e => setVisitPaymentType(e.target.value)}>
              {PAYMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div style={S.field}><label style={S.label}>Priority</label>
            <select style={S.input} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
              <option value="NORMAL">Normal</option><option value="URGENT">Urgent</option><option value="EMERGENCY">Emergency</option>
            </select>
          </div>
        </div>
        <div className="wi-btn-row" style={S.btnRow}>
          <button style={S.btnSecondary} onClick={() => setStep("home")}>← Back</button>
          <button style={S.btn} onClick={createNewPatient} disabled={loading}>{loading ? "Registering…" : "Register & Add to Queue"}</button>
        </div>
      </div>
      {/* Aadhaar scanner modal — lazy-loaded, only mounts when opened */}
      {showScanner && (
        <Suspense fallback={null}>
          <AadhaarScanner
            onComplete={fields => {
              setForm(f => ({
                ...f,
                name:        fields.name          ?? f.name,
                dateOfBirth: fields.dateOfBirth    ?? f.dateOfBirth,
                gender:      fields.gender         ?? f.gender,
                address:     fields.address        ?? f.address,
                city:        fields.city           ?? f.city,
                state:       fields.state          ?? f.state,
                pincode:     fields.pincode        ?? f.pincode,
                aadhaar:     fields.aadhaarNumber  ?? f.aadhaar,
              }));
              toast.success("Aadhaar details applied — please review and fill in any missing fields.");
            }}
            onClose={() => setShowScanner(false)}
          />
        </Suspense>
      )}
      <WalkInStyles />
    </div>
  );
}

function WalkInStyles() {
  return (
    <style>{`
      @media (max-width: 639px) {
        .wi-card     { padding: 24px 18px !important; }
        .wi-home-grid{ grid-template-columns: 1fr !important; }
        .wi-grid2    { grid-template-columns: 1fr !important; }
        .wi-row      { flex-direction: column !important; }
        .wi-btn-row  { flex-direction: column !important; }
      }
    `}</style>
  );
}

const S: Record<string, React.CSSProperties> = {
  page:         { minHeight: "100vh", background: "#F5F4F2", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif" },
  card:         { background: "#fff", borderRadius: 16, padding: "36px 40px", width: "100%", maxWidth: 680, boxShadow: "0 2px 24px rgba(0,0,0,.07)" },
  title:        { fontSize: 24, fontWeight: 700, color: "#0C1929", marginBottom: 6 },
  sub:          { fontSize: 13.5, color: "#888", marginBottom: 28 },
  back:         { background: "none", border: "none", fontSize: 13, color: "#666", cursor: "pointer", padding: "0 0 16px", fontWeight: 600 },
  scanBtn:      { display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "#0C1929", color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" as const },
  homeGrid:     { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 8 },
  homeCard:     { background: "#F8F7F5", border: "1.5px solid #E2E0DC", borderRadius: 14, padding: "28px 20px", cursor: "pointer", textAlign: "center" as const, display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 8 },
  homeIcon:     { fontSize: 28, marginBottom: 4 },
  homeCardTitle:{ fontSize: 16, fontWeight: 700, color: "#0C1929" },
  homeCardSub:  { fontSize: 12, color: "#888" },
  tabRow:       { display: "flex", gap: 8, marginBottom: 20, borderBottom: "1.5px solid #E2E0DC", paddingBottom: 12, flexWrap: "wrap" as const },
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
