"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import AdminHeader from "@/components/admin/AdminHeader";

interface Doctor {
  id: string; licenseNumber: string; specialization: string;
  approved: boolean; availability: string;
  user: { id: string; name: string; email: string; isVerified: boolean; createdAt: string };
  _count: { visits: number };
}

type EditForm = { name: string; email: string; licenseNumber: string; specialization: string; approved: boolean };

const AVAIL_COLOR: Record<string, string> = {
  AVAILABLE: "#059669", ENGAGED: "#D97706", OFFLINE: "#9CA3AF",
};

export default function AdminDoctorsPage() {
  const router = useRouter();
  const [doctors,   setDoctors]   = useState<Doctor[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showAdd,   setShowAdd]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [addForm,   setAddForm]   = useState({ name: "", email: "", password: "", licenseNumber: "", specialization: "", approved: true });

  const [editing,   setEditing]   = useState<Doctor | null>(null);
  const [editForm,  setEditForm]  = useState<EditForm | null>(null);
  const [editSaving,setEditSaving]= useState(false);

  const [resetPwd,  setResetPwd]  = useState<Doctor | null>(null);
  const [newPwd,    setNewPwd]    = useState("");
  const [pwdBusy,   setPwdBusy]  = useState(false);

  const [confirmDel, setConfirmDel] = useState<Doctor | null>(null);
  const [deleting,   setDeleting]   = useState(false);

  const logout = async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); };

  const load = () =>
    fetch("/api/admin/doctors")
      .then(r => { if (r.status === 403) router.push("/login"); return r.json(); })
      .then(d => setDoctors(d.doctors ?? []))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const addDoctor = async () => {
    if (!addForm.name || !addForm.email || !addForm.password || !addForm.licenseNumber || !addForm.specialization)
      return toast.error("All fields required");
    setSaving(true);
    const res = await fetch("/api/admin/doctors", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addForm),
    });
    const d = await res.json();
    if (!res.ok) { toast.error(d.error ?? "Failed"); setSaving(false); return; }
    toast.success("Doctor added");
    setShowAdd(false);
    setAddForm({ name: "", email: "", password: "", licenseNumber: "", specialization: "", approved: true });
    await load();
    setSaving(false);
  };

  const openEdit = (doc: Doctor) => {
    setEditing(doc);
    setEditForm({ name: doc.user.name, email: doc.user.email, licenseNumber: doc.licenseNumber, specialization: doc.specialization, approved: doc.approved });
  };

  const saveEdit = async () => {
    if (!editing || !editForm) return;
    setEditSaving(true);
    const res = await fetch(`/api/admin/doctors/${editing.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    const d = await res.json();
    if (!res.ok) { toast.error(d.error ?? "Update failed"); setEditSaving(false); return; }
    toast.success("Doctor updated");
    setEditing(null); setEditForm(null);
    await load();
    setEditSaving(false);
  };

  const resetPassword = async () => {
    if (!resetPwd || !newPwd.trim()) return;
    if (newPwd.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setPwdBusy(true);
    const res = await fetch(`/api/admin/doctors/${resetPwd.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPwd }),
    });
    if (!res.ok) { const d = await res.json(); toast.error(d.error ?? "Failed"); setPwdBusy(false); return; }
    toast.success("Password reset successfully");
    setResetPwd(null); setNewPwd("");
    setPwdBusy(false);
  };

  const toggleApproval = async (doc: Doctor) => {
    const res = await fetch(`/api/admin/doctors/${doc.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ licenseNumber: doc.licenseNumber, specialization: doc.specialization, approved: !doc.approved }),
    });
    if (res.ok) { toast.success(`Doctor ${doc.approved ? "suspended" : "approved"}`); load(); }
    else toast.error("Failed to update");
  };

  const deleteDoctor = async () => {
    if (!confirmDel) return;
    setDeleting(true);
    const res = await fetch(`/api/admin/doctors/${confirmDel.id}`, { method: "DELETE" });
    setDeleting(false);
    setConfirmDel(null);
    if (res.ok) { toast.success("Doctor removed"); load(); }
    else toast.error("Failed to delete");
  };

  if (loading) return <div style={S.loading}>Loading…</div>;

  return (
    <div style={S.page}>
      <AdminHeader />
      <main className="adoc-main" style={S.main}>
        <div className="adoc-top" style={S.topRow}>
          <h1 style={S.pageTitle}>Doctors ({doctors.length})</h1>
          <button style={S.addBtn} onClick={() => setShowAdd(true)}>+ Add Doctor</button>
        </div>

        {/* Add form */}
        {showAdd && (
          <div style={S.formCard}>
            <div style={S.formTitle}>Add New Doctor</div>
            <div className="adoc-grid2" style={S.grid2}>
              {([
                ["Full Name",       "name",           "text",     "Dr. Jane Doe"],
                ["Email",          "email",          "email",    "dr.jane@hospital.com"],
                ["Password",       "password",       "password", "Min 8 characters"],
                ["License Number", "licenseNumber",  "text",     "LIC-2024-XXX"],
                ["Specialization", "specialization", "text",     "Cardiology"],
              ] as [string, string, string, string][]).map(([label, key, type, placeholder]) => (
                <div key={key} style={S.field}>
                  <label style={S.label}>{label}</label>
                  <input style={S.input} type={type} placeholder={placeholder}
                    value={(addForm as Record<string, unknown>)[key] as string}
                    onChange={e => setAddForm(f => ({ ...f, [key]: e.target.value }))} />
                </div>
              ))}
              <div style={S.field}>
                <label style={S.label}>Auto-Approve</label>
                <select style={S.input} value={addForm.approved ? "yes" : "no"}
                  onChange={e => setAddForm(f => ({ ...f, approved: e.target.value === "yes" }))}>
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
          <div className="adoc-table-wrap" style={S.tableWrap}>
            <table className="adoc-table" style={S.table}>
              <thead>
                <tr>{["Doctor", "Email", "Specialization", "License", "Visits", "Availability", "Status", "Actions"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {doctors.map(doc => (
                  <tr key={doc.id} style={S.tr}>
                    <td data-label="Doctor" style={S.td}><div style={S.doctorName}>{doc.user.name}</div></td>
                    <td data-label="Email" style={{ ...S.td, fontSize: 12, color: "#888" }}>{doc.user.email}</td>
                    <td data-label="Specialization" style={S.td}>{doc.specialization}</td>
                    <td data-label="License" style={{ ...S.td, fontSize: 12 }}>{doc.licenseNumber}</td>
                    <td data-label="Visits" style={{ ...S.td, textAlign: "center" }}>{doc._count.visits}</td>
                    <td data-label="Availability" style={S.td}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: AVAIL_COLOR[doc.availability] ?? "#888" }}>
                        {doc.availability}
                      </span>
                    </td>
                    <td data-label="Status" style={S.td}>
                      <span style={{ ...S.pill, background: doc.approved ? "#D1FAE5" : "#FEF3C7", color: doc.approved ? "#065F46" : "#92400E" }}>
                        {doc.approved ? "Approved" : "Pending"}
                      </span>
                    </td>
                    <td data-label="Actions" style={S.td}>
                      <div className="adoc-act-btns" style={S.actBtns}>
                        <button style={{ ...S.actBtn, color: "#2563EB" }} onClick={() => openEdit(doc)}>Edit</button>
                        <button style={{ ...S.actBtn, color: "#D97706" }} onClick={() => { setResetPwd(doc); setNewPwd(""); }}>Reset Pwd</button>
                        <button style={{ ...S.actBtn, color: doc.approved ? "#D97706" : "#059669" }} onClick={() => toggleApproval(doc)}>
                          {doc.approved ? "Suspend" : "Approve"}
                        </button>
                        <button style={{ ...S.actBtn, color: "#DC2626" }} onClick={() => setConfirmDel(doc)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Edit Doctor Modal */}
      {editing && editForm && (
        <div style={overlay}>
          <div style={{ ...modal, maxWidth: 480 }}>
            <div style={modalHdr}>Edit Doctor — {editing.user.name}</div>
            <div className="adoc-modal-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px", marginBottom: 20 }}>
              {([
                { key: "name",           label: "Full Name",     type: "text"  },
                { key: "email",          label: "Email",         type: "email" },
                { key: "licenseNumber",  label: "License Number",type: "text"  },
                { key: "specialization", label: "Specialization",type: "text"  },
              ] as { key: keyof EditForm; label: string; type: string }[]).map(({ key, label, type }) => (
                <div key={key}>
                  <label style={lbl}>{label}</label>
                  <input type={type} style={inp} value={editForm[key] as string}
                    onChange={e => setEditForm({ ...editForm, [key]: e.target.value })} />
                </div>
              ))}
              <div>
                <label style={lbl}>Approval Status</label>
                <select style={inp} value={editForm.approved ? "yes" : "no"}
                  onChange={e => setEditForm({ ...editForm, approved: e.target.value === "yes" })}>
                  <option value="yes">Approved</option>
                  <option value="no">Pending / Suspended</option>
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setEditing(null); setEditForm(null); }} style={cancelBtn}>Cancel</button>
              <button onClick={saveEdit} disabled={editSaving} style={primaryBtn}>{editSaving ? "Saving…" : "Save Changes"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetPwd && (
        <div style={overlay}>
          <div style={{ ...modal, maxWidth: 360 }}>
            <div style={modalHdr}>Reset Password — {resetPwd.user.name}</div>
            <label style={lbl}>New Password</label>
            <input type="password" style={{ ...inp, marginBottom: 20 }} value={newPwd}
              onChange={e => setNewPwd(e.target.value)} placeholder="Min 6 characters" />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setResetPwd(null); setNewPwd(""); }} style={cancelBtn}>Cancel</button>
              <button onClick={resetPassword} disabled={pwdBusy} style={primaryBtn}>{pwdBusy ? "Resetting…" : "Reset Password"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDel && (
        <div style={overlay}>
          <div style={{ ...modal, maxWidth: 360 }}>
            <div style={modalHdr}>Delete Doctor</div>
            <p style={{ fontSize: 14, color: "#555", marginBottom: 20 }}>
              Are you sure you want to delete <strong>{confirmDel.user.name}</strong>? This action cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDel(null)} style={cancelBtn} disabled={deleting}>Cancel</button>
              <button onClick={deleteDoctor} disabled={deleting}
                style={{ ...primaryBtn, background: "#DC2626" }}>
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 639px) {
          .adoc-main  { padding: 16px 14px !important; }
          .adoc-top   { flex-direction: column !important; align-items: stretch !important; gap: 10px !important; }
          .adoc-top button { width: 100% !important; }
          .adoc-grid2 { grid-template-columns: 1fr !important; }
          .adoc-table-wrap { overflow-x: visible !important; }
          .adoc-table thead { display: none; }
          .adoc-table tbody tr {
            display: block;
            border-radius: 12px;
            border: 1.5px solid #E8E6E3 !important;
            margin-bottom: 10px;
            padding: 2px 0;
            background: #fff;
          }
          .adoc-table tbody td {
            display: flex !important;
            align-items: flex-start;
            justify-content: space-between;
            gap: 10px;
            padding: 9px 14px !important;
            border-bottom: 1px solid #F5F3F0;
            font-size: 13px !important;
            text-align: left !important;
          }
          .adoc-table tbody td:last-child { border-bottom: none; }
          .adoc-table tbody td::before {
            content: attr(data-label);
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: .06em;
            color: #999;
            min-width: 80px;
            flex-shrink: 0;
            padding-top: 2px;
          }
          .adoc-act-btns { flex-direction: column !important; gap: 6px !important; }
          .adoc-modal-grid { grid-template-columns: 1fr !important; }
        }
        @media (min-width: 640px) and (max-width: 1023px) {
          .adoc-main  { padding: 20px 18px !important; }
          .adoc-grid2 { grid-template-columns: 1fr 1fr !important; }
          .adoc-modal-grid { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>
    </div>
  );
}

const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 };
const modal:   React.CSSProperties = { background: "#fff", borderRadius: 18, padding: 28, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,.15)", maxHeight: "90vh", overflowY: "auto" };
const modalHdr:React.CSSProperties = { fontSize: 17, fontWeight: 700, color: "#111", marginBottom: 20 };
const lbl:     React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#666", marginBottom: 5 };
const inp:     React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1.5px solid #E2E0DC", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box" };
const cancelBtn: React.CSSProperties = { flex: 1, padding: "10px", border: "1.5px solid #E2E0DC", borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: "pointer", background: "#fff", color: "#555" };
const primaryBtn:React.CSSProperties = { flex: 1, padding: "10px", border: "none", borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: "pointer", background: "#0C1929", color: "#fff" };

const S: Record<string, React.CSSProperties> = {
  loading:     { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui,sans-serif", color: "#888" },
  page:        { minHeight: "100vh", background: "#F5F4F2", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif" },
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
  actBtns:     { display: "flex", gap: 10, flexWrap: "wrap" },
  actBtn:      { background: "none", border: "none", fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: "2px 0" },
};
