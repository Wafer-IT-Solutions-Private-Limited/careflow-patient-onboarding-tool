"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

export default function HealthSetupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [hasAadhaar, setHasAadhaar] = useState<boolean | null>(null);
  const [form, setForm] = useState({
    aadhaar:           "",
    bloodGroup:        "",
    allergies:         "",
    chronicConditions: "",
    emergencyContact:  "",
    emergencyPhone:    "",
  });

  useEffect(() => {
    fetch("/api/patient/health-setup")
      .then(r => r.json())
      .then(d => setHasAadhaar(!!d.hasAadhaar))
      .catch(() => setHasAadhaar(false));
  }, []);

  const f = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [field]: e.target.value }));

  const submit = async () => {
    if (!form.bloodGroup)        { toast.error("Please select a blood group"); return; }
    if (!form.allergies.trim())  { toast.error("Please fill in the allergies field (enter None if none)"); return; }
    if (!form.chronicConditions.trim()) { toast.error("Please fill in chronic conditions (enter None if none)"); return; }
    if (!form.emergencyContact.trim())  { toast.error("Emergency contact name is required"); return; }
    if (!form.emergencyPhone.trim())    { toast.error("Emergency contact phone is required"); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/patient/health-setup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed"); return; }
      toast.success("Health profile saved!");
      router.push("/patient");
      router.refresh();
    } finally { setLoading(false); }
  };

  return (
    <div style={S.page}>
      <div className="hs-card" style={S.card}>
        <div style={S.header}>
          <div style={S.step}>Step 2 of 2</div>
          <h1 style={S.title}>Health Profile Setup</h1>
          <p style={S.sub}>All fields below are required. If a field doesn&apos;t apply, enter <strong>None</strong>.</p>
        </div>

        <div className="hs-grid" style={S.grid}>
          <div style={S.field}>
            <label style={S.label}>
              Aadhaar Number
              {hasAadhaar
                ? <span style={S.lockedBadge}>🔒 On file</span>
                : <span style={S.opt}>(optional)</span>
              }
            </label>
            {hasAadhaar ? (
              <>
                <input
                  style={{ ...S.input, background: "#F3F4F6", color: "#9CA3AF", cursor: "not-allowed" }}
                  value="•••• •••• ••••"
                  disabled
                  readOnly
                />
                <span style={S.hint}>Aadhaar was registered at the hospital and is already stored securely as a hash.</span>
              </>
            ) : (
              <>
                <input style={S.input} value={form.aadhaar} onChange={f("aadhaar")}
                  placeholder="1234 5678 9012" maxLength={14} />
                <span style={S.hint}>Stored as a secure hash for duplicate detection only.</span>
              </>
            )}
          </div>

          <div style={S.field}>
            <label style={S.label}>Blood Group <span style={S.req}>*</span></label>
            <select style={S.input} value={form.bloodGroup} onChange={f("bloodGroup")}>
              <option value="">Select blood group</option>
              {["A+","A−","B+","B−","AB+","AB−","O+","O−"].map(g => <option key={g}>{g}</option>)}
            </select>
          </div>

          <div style={{ ...S.field, gridColumn: "1 / -1" }}>
            <label style={S.label}>Known Allergies <span style={S.req}>*</span></label>
            <textarea style={{ ...S.input, minHeight: 72, resize: "vertical" }}
              value={form.allergies} onChange={f("allergies")}
              placeholder="e.g. Penicillin, Dust — or type None" />
          </div>

          <div style={{ ...S.field, gridColumn: "1 / -1" }}>
            <label style={S.label}>Chronic Conditions <span style={S.req}>*</span></label>
            <textarea style={{ ...S.input, minHeight: 72, resize: "vertical" }}
              value={form.chronicConditions} onChange={f("chronicConditions")}
              placeholder="e.g. Diabetes Type 2, Hypertension — or type None" />
          </div>

          <div style={S.field}>
            <label style={S.label}>Emergency Contact Name <span style={S.req}>*</span></label>
            <input style={S.input} value={form.emergencyContact} onChange={f("emergencyContact")}
              placeholder="Full name" />
          </div>

          <div style={S.field}>
            <label style={S.label}>Emergency Contact Phone <span style={S.req}>*</span></label>
            <input style={S.input} value={form.emergencyPhone} onChange={f("emergencyPhone")}
              placeholder="10-digit mobile" />
          </div>
        </div>

        <div style={S.actions}>
          <button style={S.saveBtn} onClick={submit} disabled={loading}>
            {loading ? "Saving…" : "Save & Continue"}
          </button>
        </div>
      </div>

      <style>{`
        input::placeholder, textarea::placeholder { color: #888 !important; opacity: 1; }
        select option { color: #111; }
        @media (max-width: 639px) {
          .hs-card { padding: 24px 18px !important; }
          .hs-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page:        { minHeight: "100vh", background: "#F5F4F2", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif" },
  card:        { background: "#fff", borderRadius: 16, padding: "36px 40px", width: "100%", maxWidth: 620, boxShadow: "0 2px 24px rgba(0,0,0,.07)" },
  header:      { marginBottom: 28 },
  step:        { fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" as const, color: "#0C1929", background: "#E8EEF8", padding: "4px 10px", borderRadius: 20, display: "inline-block", marginBottom: 12 },
  title:       { fontSize: 24, fontWeight: 700, color: "#0C1929", marginBottom: 6 },
  sub:         { fontSize: 13.5, color: "#888", lineHeight: 1.5 },
  grid:        { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 20px", marginBottom: 28 },
  field:       { display: "flex", flexDirection: "column", gap: 6 },
  label:       { fontSize: 11, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase" as const, color: "#555", display: "flex", alignItems: "center", gap: 8 },
  req:         { color: "#DC2626", fontWeight: 700 },
  opt:         { fontWeight: 400, textTransform: "none" as const, color: "#aaa", letterSpacing: 0 },
  lockedBadge: { fontWeight: 600, textTransform: "none" as const, letterSpacing: 0, fontSize: 11, color: "#059669", background: "#ECFDF5", borderRadius: 20, padding: "2px 8px" },
  input:       { padding: "10px 14px", border: "1.5px solid #E2E0DC", borderRadius: 9, fontSize: 14, color: "#111", background: "#FDFCFB", outline: "none", boxSizing: "border-box" as const, width: "100%" },
  hint:        { fontSize: 11, color: "#aaa", lineHeight: 1.4 },
  actions:     { display: "flex", justifyContent: "flex-end" },
  saveBtn:     { padding: "10px 28px", background: "#0C1929", color: "#fff", border: "none", borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: "pointer" },
};
