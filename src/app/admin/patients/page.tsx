"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import AdminHeader from "@/components/admin/AdminHeader";

type PatientProfile = {
  id: string;
  prn: string;
  dateOfBirth: string | null;
  gender: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  healthIssues: string | null;
  paymentType: string | null;
  priority: string;
};

type Patient = {
  id:             string;
  name:           string;
  email:          string;
  isVerified:     boolean;
  createdAt:      string;
  patientProfile: PatientProfile | null;
};

type EditState = {
  name:        string;
  email:       string;
  dateOfBirth: string;
  gender:      string;
  phone:       string;
  address:     string;
  city:        string;
  state:       string;
  pincode:     string;
  healthIssues:string;
  paymentType: string;
  priority:    string;
  isVerified:  boolean;
};

type HistoryRecord = {
  id: string;
  visitDate: string;
  token: string;
  status: string;
  cancelReason?: string;
  doctor?: { user: { name: string } };
  consultation?: { healthNotes?: string; prescription?: string };
};

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function AdminPatientsPage() {
  const router = useRouter();
  const [patients,  setPatients]   = useState<Patient[]>([]);
  const [loading,   setLoading]    = useState(true);
  const [search,    setSearch]     = useState("");
  const [editing,   setEditing]    = useState<Patient | null>(null);
  const [editState, setEditState]  = useState<EditState | null>(null);
  const [saving,    setSaving]     = useState(false);
  const [deleting,  setDeleting]   = useState<Patient | null>(null);
  const [delBusy,   setDelBusy]    = useState(false);
  const [resetPwd,  setResetPwd]   = useState<Patient | null>(null);
  const [newPwd,    setNewPwd]     = useState("");
  const [pwdBusy,   setPwdBusy]    = useState(false);
  const [historyPatient, setHistoryPatient] = useState<Patient | null>(null);
  const [history,        setHistory]        = useState<HistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchPatients = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/patients");
      if (res.status === 401) { router.push("/login"); return; }
      const data = await res.json();
      setPatients(data.patients ?? []);
    } catch {
      toast.error("Failed to load patients");
    } finally { setLoading(false); }
  }, [router]);

  useEffect(() => { fetchPatients(); }, [fetchPatients]);

  const openEdit = (p: Patient) => {
    setEditing(p);
    setEditState({
      name:         p.name,
      email:        p.email,
      dateOfBirth:  p.patientProfile?.dateOfBirth ? new Date(p.patientProfile.dateOfBirth).toISOString().split("T")[0] : "",
      gender:       p.patientProfile?.gender ?? "",
      phone:        p.patientProfile?.phone ?? "",
      address:      p.patientProfile?.address ?? "",
      city:         p.patientProfile?.city ?? "",
      state:        p.patientProfile?.state ?? "",
      pincode:      p.patientProfile?.pincode ?? "",
      healthIssues: p.patientProfile?.healthIssues ?? "",
      paymentType:  p.patientProfile?.paymentType ?? "Cash",
      priority:     p.patientProfile?.priority ?? "NORMAL",
      isVerified:   p.isVerified,
    });
  };

  const saveEdit = async () => {
    if (!editing || !editState) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/patients/${editing.id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ...editState, dateOfBirth: editState.dateOfBirth || null }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Update failed"); return; }
      toast.success("Patient updated");
      setEditing(null); setEditState(null);
      fetchPatients();
    } catch { toast.error("Network error"); }
    finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDelBusy(true);
    try {
      const res = await fetch(`/api/admin/patients/${deleting.id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); toast.error(d.error ?? "Delete failed"); return; }
      toast.success(`${deleting.name} removed`);
      setDeleting(null); fetchPatients();
    } catch { toast.error("Network error"); }
    finally { setDelBusy(false); }
  };

  const resetPassword = async () => {
    if (!resetPwd || !newPwd.trim()) return;
    if (newPwd.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setPwdBusy(true);
    try {
      const res = await fetch(`/api/admin/patients/${resetPwd.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPwd }),
      });
      if (!res.ok) { const d = await res.json(); toast.error(d.error ?? "Failed"); return; }
      toast.success("Password reset successfully");
      setResetPwd(null); setNewPwd("");
    } catch { toast.error("Network error"); }
    finally { setPwdBusy(false); }
  };

  const openHistory = async (p: Patient) => {
    setHistoryPatient(p);
    setHistory([]);
    setHistoryLoading(true);
    const patientProfileId = p.patientProfile?.id;
    if (!patientProfileId) { toast.error("Patient profile not found"); setHistoryLoading(false); return; }
    try {
      const res = await fetch(`/api/admin/patients/${patientProfileId}/history`);
      const data = await res.json();
      if (res.ok) setHistory(data.history ?? []);
      else toast.error(data.error ?? "Failed to load history");
    } finally { setHistoryLoading(false); }
  };

  const filtered = patients.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.email.toLowerCase().includes(search.toLowerCase()) ||
    (p.patientProfile?.prn ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ minHeight: "100vh", background: "#F8F7F5", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif" }}>
      <AdminHeader />
      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#111" }}>Patient Management</div>
          <div style={{ fontSize: 13, color: "#888" }}>View, edit and manage registered patients</div>
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, gap: 12 }}>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, email or PRN…"
              style={{ flex: 1, maxWidth: 380, padding: "9px 14px", border: "1.5px solid #E2E0DC", borderRadius: 9, fontSize: 14, outline: "none", background: "#fff" }}
            />
            <div style={{ fontSize: 13, color: "#888", fontWeight: 500 }}>{filtered.length} patient{filtered.length !== 1 ? "s" : ""}</div>
          </div>

          <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 1px 4px rgba(0,0,0,.06)", overflow: "hidden" }}>
            {loading ? (
              <div style={{ padding: 60, textAlign: "center", color: "#aaa", fontSize: 14 }}>Loading patients…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 60, textAlign: "center", color: "#aaa", fontSize: 14 }}>
                {search ? "No patients match your search." : "No patients registered yet."}
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #F0EEEA" }}>
                      {["Patient", "PRN", "Email", "Phone", "Gender", "Registered", "Status", "Actions"].map(h => (
                        <th key={h} style={{ padding: "12px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "#999", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(p => (
                      <tr key={p.id} style={{ borderBottom: "1px solid #F8F7F5" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#FAFAF8")}
                        onMouseLeave={e => (e.currentTarget.style.background = "")}>
                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                            <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, background: "#EDE9FE", color: "#6D28D9", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13 }}>
                              {p.name.charAt(0).toUpperCase()}
                            </div>
                            <span style={{ fontWeight: 600, color: "#111" }}>{p.name}</span>
                          </div>
                        </td>
                        <td style={{ padding: "12px 14px", fontSize: 12, fontWeight: 700, color: "#6D28D9", whiteSpace: "nowrap" }}>{p.patientProfile?.prn ?? "—"}</td>
                        <td style={{ padding: "12px 14px", color: "#555" }}>{p.email}</td>
                        <td style={{ padding: "12px 14px", color: "#777" }}>{p.patientProfile?.phone ?? "—"}</td>
                        <td style={{ padding: "12px 14px", color: "#777" }}>{p.patientProfile?.gender ?? "—"}</td>
                        <td style={{ padding: "12px 14px", color: "#777", whiteSpace: "nowrap" }}>{fmt(p.createdAt)}</td>
                        <td style={{ padding: "12px 14px" }}>
                          <span style={{ padding: "3px 10px", borderRadius: 100, fontSize: 11, fontWeight: 700, background: p.isVerified ? "#ECFDF5" : "#FEF3C7", color: p.isVerified ? "#065F46" : "#92400E" }}>
                            {p.isVerified ? "Active" : "Pending"}
                          </span>
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                            <button onClick={() => openHistory(p)} style={{ ...btn, color: "#2563EB", borderColor: "#93C5FD" }}>History</button>
                            <button onClick={() => openEdit(p)} style={btn}>Edit</button>
                            <button onClick={() => { setResetPwd(p); setNewPwd(""); }} style={{ ...btn, color: "#D97706", borderColor: "#FCD34D" }}>Reset Pwd</button>
                            <button onClick={() => setDeleting(p)} style={{ ...btn, color: "#B91C1C", borderColor: "#FCA5A5", background: "#FFF5F5" }}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Edit Modal */}
      {editing && editState && (
        <div style={overlay}>
          <div style={{ ...modal, maxWidth: 560 }}>
            <div style={modalHdr}>Edit Patient</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px", marginBottom: 16 }}>
              {([
                { key: "name",         label: "Full Name",     type: "text"  },
                { key: "email",        label: "Email",         type: "email" },
                { key: "dateOfBirth",  label: "Date of Birth", type: "date"  },
                { key: "gender",       label: "Gender",        type: "select", opts: ["", "Male", "Female", "Other"] },
                { key: "phone",        label: "Phone",         type: "text"  },
                { key: "city",         label: "City",          type: "text"  },
                { key: "state",        label: "State",         type: "text"  },
                { key: "pincode",      label: "Pincode",       type: "text"  },
                { key: "paymentType",  label: "Payment Type",  type: "select", opts: ["Cash", "UPI", "Net Banking", "Debit or Credit Card", "Insurance Cashless Claims"] },
                { key: "priority",     label: "Priority",      type: "select", opts: ["NORMAL", "URGENT", "EMERGENCY"] },
              ] as { key: keyof EditState; label: string; type: string; opts?: string[] }[]).map(({ key, label, type, opts }) => (
                <div key={key}>
                  <label style={lbl}>{label}</label>
                  {type === "select" ? (
                    <select style={inp} value={editState[key] as string} onChange={e => setEditState({ ...editState, [key]: e.target.value })}>
                      {opts!.map(o => <option key={o} value={o}>{o || "Select"}</option>)}
                    </select>
                  ) : (
                    <input type={type} style={inp} value={editState[key] as string} onChange={e => setEditState({ ...editState, [key]: e.target.value })} />
                  )}
                </div>
              ))}
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>Health Issues / Complaint</label>
                <textarea style={{ ...inp, minHeight: 64, resize: "vertical" as const }}
                  value={editState.healthIssues} onChange={e => setEditState({ ...editState, healthIssues: e.target.value })} />
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 20 }}>
              <input type="checkbox" checked={editState.isVerified} onChange={e => setEditState({ ...editState, isVerified: e.target.checked })} style={{ width: 16, height: 16 }} />
              <span style={{ fontSize: 13, color: "#555" }}>Account is active</span>
            </label>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setEditing(null); setEditState(null); }} style={cancelBtn}>Cancel</button>
              <button onClick={saveEdit} disabled={saving} style={primaryBtn}>{saving ? "Saving…" : "Save Changes"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetPwd && (
        <div style={overlay}>
          <div style={{ ...modal, maxWidth: 380 }}>
            <div style={modalHdr}>Reset Password — {resetPwd.name}</div>
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

      {/* Visit History Modal */}
      {historyPatient && (
        <div style={overlay} onClick={() => setHistoryPatient(null)}>
          <div style={{ ...modal, maxWidth: 680 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={modalHdr}>Visit History — {historyPatient.name}</div>
              <button onClick={() => setHistoryPatient(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#aaa", lineHeight: 1 }}>×</button>
            </div>
            {historyLoading ? (
              <div style={{ textAlign: "center", color: "#aaa", padding: "30px 0" }}>Loading history…</div>
            ) : history.length === 0 ? (
              <div style={{ textAlign: "center", color: "#aaa", padding: "30px 0", fontSize: 14 }}>No visit records found.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #F0EEEA" }}>
                      {["Date", "Token", "Doctor", "Status", "Notes"].map(h => (
                        <th key={h} style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".06em", color: "#999", padding: "8px 10px", textAlign: "left" as const, borderBottom: "1px solid #F0EEEA" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(v => (
                      <tr key={v.id} style={{ borderBottom: "1px solid #F8F7F5" }}>
                        <td style={{ padding: "10px 10px", whiteSpace: "nowrap", color: "#555" }}>{fmt(v.visitDate)}</td>
                        <td style={{ padding: "10px 10px", fontWeight: 800, color: "#0C1929" }}>{v.token}</td>
                        <td style={{ padding: "10px 10px", color: "#555" }}>{v.doctor?.user.name ?? "—"}</td>
                        <td style={{ padding: "10px 10px" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: v.status === "CANCELLED" ? "#FEE2E2" : v.status === "COMPLETED" ? "#ECFDF5" : "#EFF6FF", color: v.status === "CANCELLED" ? "#DC2626" : v.status === "COMPLETED" ? "#059669" : "#2563EB" }}>
                            {v.status}
                          </span>
                          {v.cancelReason && <div style={{ fontSize: 11, color: "#DC2626", marginTop: 3 }}>Note: {v.cancelReason}</div>}
                        </td>
                        <td style={{ padding: "10px 10px", maxWidth: 200, color: "#555" }}>
                          {v.consultation?.healthNotes ?? v.consultation?.prescription ?? <span style={{ color: "#ccc" }}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleting && (
        <div style={overlay}>
          <div style={{ ...modal, maxWidth: 380 }}>
            <div style={{ width: 44, height: 44, background: "#FEE2E2", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, marginBottom: 14 }}>🗑️</div>
            <div style={modalHdr}>Delete patient?</div>
            <p style={{ fontSize: 13.5, color: "#666", lineHeight: 1.55, marginBottom: 20 }}>
              This will permanently remove <strong>{deleting.name}</strong> and all their data.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDeleting(null)} style={cancelBtn}>Cancel</button>
              <button onClick={confirmDelete} disabled={delBusy} style={{ ...primaryBtn, background: delBusy ? "#FCA5A5" : "#B91C1C" }}>{delBusy ? "Deleting…" : "Yes, delete"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 };
const modal:   React.CSSProperties = { background: "#fff", borderRadius: 18, padding: 28, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,.15)", maxHeight: "90vh", overflowY: "auto" };
const modalHdr:React.CSSProperties = { fontSize: 17, fontWeight: 700, color: "#111", marginBottom: 20 };
const lbl:     React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#666", marginBottom: 5 };
const inp:     React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1.5px solid #E2E0DC", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box" };
const btn:     React.CSSProperties = { padding: "5px 12px", border: "1.5px solid #DDD", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", background: "#fff", color: "#333" };
const cancelBtn: React.CSSProperties = { flex: 1, padding: "10px", border: "1.5px solid #E2E0DC", borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: "pointer", background: "#fff", color: "#555" };
const primaryBtn: React.CSSProperties = { flex: 1, padding: "10px", border: "none", borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: "pointer", background: "#0C1929", color: "#fff" };
