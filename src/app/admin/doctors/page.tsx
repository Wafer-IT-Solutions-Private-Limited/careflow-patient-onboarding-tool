"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";

interface Doctor {
  id: string; licenseNumber: string; specialization: string;
  approved: boolean; availability: string;
  user: { id: string; name: string; email: string; isVerified: boolean; createdAt: string };
  _count: { visits: number };
}

export default function AdminDoctorsPage() {
  const router = useRouter();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [form, setForm]       = useState({ name: "", email: "", password: "", licenseNumber: "", specialization: "", approved: true });

  const logout = async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); };

  const load = () => fetch("/api/admin/doctors").then(r => { if (r.status === 403) router.push("/login"); return r.json(); })
    .then(d => setDoctors(d.doctors ?? [])).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const addDoctor = async () => {
    if (!form.name || !form.email || !form.password || !form.licenseNumber || !form.specialization)
      return toast.error("All fields required");
    setSaving(true);
    const res = await fetch("/api/admin/doctors", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const d = await res.json();
    if (!res.ok) { toast.error(d.error ?? "Failed"); setSaving(false); return; }
    toast.success("Doctor added");
    setShowAdd(false);
    setForm({ name: "", email: "", password: "", licenseNumber: "", specialization: "", approved: true });
    await load();
    setSaving(false);
  };

  const toggleApproval = async (doc: Doctor) => {
    const res = await fetch(`/api/admin/doctors/${doc.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ licenseNumber: doc.licenseNumber, specialization: doc.specialization, approved: !doc.approved }),
    });
    if (res.ok) { toast.success(`Doctor ${doc.approved ? "suspended" : "approved"}`); load(); }
    else toast.error("Failed to update");
  };

  const deleteDoctor = async (doc: Doctor) => {
    if (!confirm(`Delete Dr. ${doc.user.name}? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/doctors/${doc.id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Doctor removed"); load(); }
    else toast.error("Failed to delete");
  };

  if (loading) return <div style={S.loading}>Loading…</div>;

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div style={S.headerInner}>
          <div style={S.brand}>
            <img src="/waferlogo.png" alt="Wafer" style={S.logo} />
            <span style={S.brandName}>Doctor Management</span>
          </div>
          <div style={S.headerRight}>
            <Link href="/admin" style={S.navLink}>← Dashboard</Link>
            <button style={S.logoutBtn} onClick={logout}>Sign Out</button>
          </div>
        </div>
      </header>

      <main style={S.main}>
        <div style={S.topRow}>
          <h1 style={S.pageTitle}>Doctors ({doctors.length})</h1>
          <button style={S.addBtn} onClick={() => setShowAdd(true)}>+ Add Doctor</button>
        </div>

        {/* Add form */}
        {showAdd && (
          <div style={S.formCard}>
            <div style={S.formTitle}>Add New Doctor</div>
            <div style={S.grid2}>
              {[
                ["Full Name",       "name",           "text",     "Dr. Jane Doe"],
                ["Email",          "email",          "email",    "dr.jane@hospital.com"],
                ["Password",       "password",       "password", "Min 8 characters"],
                ["License Number", "licenseNumber",  "text",     "LIC-2024-XXX"],
                ["Specialization", "specialization", "text",     "Cardiology"],
              ].map(([label, key, type, placeholder]) => (
                <div key={key} style={S.field}>
                  <label style={S.label}>{label}</label>
                  <input style={S.input} type={type} placeholder={placeholder}
                    value={(form as Record<string, string>)[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
                </div>
              ))}
              <div style={S.field}>
                <label style={S.label}>Auto-Approve</label>
                <select style={S.input} value={form.approved ? "yes" : "no"}
                  onChange={e => setForm(f => ({ ...f, approved: e.target.value === "yes" }))}>
                  <option value="yes">Yes</option>
                  <option value="no">No (pending review)</option>
                </select>
              </div>
            </div>
            <div style={S.formBtns}>
              <button style={S.btnSecondary} onClick={() => setShowAdd(false)}>Cancel</button>
              <button style={S.btn} onClick={addDoctor} disabled={saving}>{saving ? "Adding…" : "Add Doctor"}</button>
            </div>
          </div>
        )}

        {/* Table */}
        <div style={S.tableCard}>
          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead>
                <tr>{["Doctor", "Email", "Specialization", "License", "Visits", "Status", "Actions"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {doctors.map(doc => (
                  <tr key={doc.id} style={S.tr}>
                    <td style={S.td}><div style={S.doctorName}>{doc.user.name}</div></td>
                    <td style={{ ...S.td, fontSize: 12, color: "#888" }}>{doc.user.email}</td>
                    <td style={S.td}>{doc.specialization}</td>
                    <td style={{ ...S.td, fontSize: 12 }}>{doc.licenseNumber}</td>
                    <td style={{ ...S.td, textAlign: "center" }}>{doc._count.visits}</td>
                    <td style={S.td}>
                      <span style={{ ...S.pill, background: doc.approved ? "#D1FAE5" : "#FEF3C7", color: doc.approved ? "#065F46" : "#92400E" }}>
                        {doc.approved ? "Approved" : "Pending"}
                      </span>
                    </td>
                    <td style={S.td}>
                      <div style={S.actBtns}>
                        <button style={{ ...S.actBtn, color: doc.approved ? "#D97706" : "#059669" }} onClick={() => toggleApproval(doc)}>
                          {doc.approved ? "Suspend" : "Approve"}
                        </button>
                        <button style={{ ...S.actBtn, color: "#DC2626" }} onClick={() => deleteDoctor(doc)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  loading:     { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui,sans-serif", color: "#888" },
  page:        { minHeight: "100vh", background: "#F5F4F2", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif" },
  header:      { background: "#0C1929", padding: "0 24px" },
  headerInner: { maxWidth: 1200, margin: "0 auto", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" },
  brand:       { display: "flex", alignItems: "center", gap: 10 },
  logo:        { height: 28, filter: "brightness(0) invert(1)" },
  brandName:   { fontSize: 15, fontWeight: 700, color: "#fff" },
  headerRight: { display: "flex", alignItems: "center", gap: 12 },
  navLink:     { fontSize: 13.5, color: "rgba(255,255,255,.75)", textDecoration: "none" },
  logoutBtn:   { fontSize: 12.5, color: "rgba(255,255,255,.6)", background: "transparent", border: "1px solid rgba(255,255,255,.2)", borderRadius: 8, padding: "5px 12px", cursor: "pointer" },
  main:        { maxWidth: 1200, margin: "0 auto", padding: "32px 24px" },
  topRow:      { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  pageTitle:   { fontSize: 22, fontWeight: 700, color: "#0C1929" },
  addBtn:      { padding: "9px 20px", background: "#0C1929", color: "#fff", border: "none", borderRadius: 9, fontSize: 13.5, fontWeight: 600, cursor: "pointer" },
  formCard:    { background: "#fff", borderRadius: 14, padding: "24px 28px", boxShadow: "0 1px 6px rgba(0,0,0,.06)", marginBottom: 20 },
  formTitle:   { fontSize: 15, fontWeight: 700, color: "#0C1929", marginBottom: 20 },
  grid2:       { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 16px", marginBottom: 20 },
  field:       { display: "flex", flexDirection: "column" },
  label:       { fontSize: 11, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 6 },
  input:       { padding: "9px 14px", border: "1.5px solid #E2E0DC", borderRadius: 9, fontSize: 14, color: "#111", background: "#FDFCFB", outline: "none" },
  formBtns:    { display: "flex", gap: 10, justifyContent: "flex-end" },
  btn:         { padding: "9px 22px", background: "#0C1929", color: "#fff", border: "none", borderRadius: 9, fontSize: 13.5, fontWeight: 600, cursor: "pointer" },
  btnSecondary:{ padding: "9px 22px", background: "transparent", color: "#0C1929", border: "1.5px solid #0C1929", borderRadius: 9, fontSize: 13.5, fontWeight: 600, cursor: "pointer" },
  tableCard:   { background: "#fff", borderRadius: 14, padding: "24px", boxShadow: "0 1px 6px rgba(0,0,0,.05)" },
  tableWrap:   { overflowX: "auto" },
  table:       { width: "100%", borderCollapse: "collapse" },
  th:          { fontSize: 11, fontWeight: 700, color: "#999", letterSpacing: ".07em", textTransform: "uppercase", padding: "8px 14px", textAlign: "left", borderBottom: "1px solid #E8E6E3" },
  tr:          { borderBottom: "1px solid #F0EEEB" },
  td:          { padding: "13px 14px", fontSize: 13.5, color: "#333" },
  doctorName:  { fontWeight: 600, color: "#0C1929" },
  pill:        { fontSize: 11.5, fontWeight: 700, padding: "3px 10px", borderRadius: 12 },
  actBtns:     { display: "flex", gap: 8 },
  actBtn:      { background: "none", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "2px 0" },
};
