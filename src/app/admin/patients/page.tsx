"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

type Patient = {
  id:         string;
  name:       string;
  email:      string;
  isVerified: boolean;
  createdAt:  string;
  patientProfile: { id: string; dateOfBirth: string | null } | null;
};

type EditState = {
  name:        string;
  email:       string;
  dateOfBirth: string;
  isVerified:  boolean;
};

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function AdminPatientsPage() {
  const router = useRouter();
  const [patients,  setPatients]  = useState<Patient[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [editing,   setEditing]   = useState<Patient | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [deleting,  setDeleting]  = useState<Patient | null>(null);
  const [delBusy,   setDelBusy]   = useState(false);

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
      name:        p.name,
      email:       p.email,
      dateOfBirth: p.patientProfile?.dateOfBirth
        ? new Date(p.patientProfile.dateOfBirth).toISOString().split("T")[0]
        : "",
      isVerified:  p.isVerified,
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
      setEditing(null);
      setEditState(null);
      fetchPatients();
    } catch { toast.error("Network error"); }
    finally  { setSaving(false); }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDelBusy(true);
    try {
      const res = await fetch(`/api/admin/patients/${deleting.id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); toast.error(d.error ?? "Delete failed"); return; }
      toast.success(`${deleting.name} removed`);
      setDeleting(null);
      fetchPatients();
    } catch { toast.error("Network error"); }
    finally  { setDelBusy(false); }
  };

  const filtered = patients.filter(
    (p) => p.name.toLowerCase().includes(search.toLowerCase()) ||
           p.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:"#F8F7F5",
                  fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif" }}>

      {/* ── Sidebar ── */}
      <aside style={{ position:"fixed", inset:"0 auto 0 0", width:256,
                      background:"#fff", boxShadow:"1px 0 0 #F0EEEA", zIndex:20 }}>
        <div style={{ height:64, display:"flex", alignItems:"center", gap:10,
                      borderBottom:"1px solid #F0EEEA", padding:"0 24px" }}>
          <img src="/waferlogo.png" alt="Wafer" style={{ height:28, width:"auto" }} />
          <span style={{ fontSize:13, fontWeight:700, background:"#F0EEFF",
                         color:"#6D28D9", padding:"2px 8px", borderRadius:6 }}>Admin</span>
        </div>
        <nav style={{ marginTop:20, padding:"0 12px" }}>
          {[
            { label:"Dashboard",         href:"/admin",          icon:"🏠" },
            { label:"Patient Management",href:"/admin/patients", icon:"🧑‍⚕️", active:true },
            { label:"Doctor Approvals",  href:"/admin",          icon:"🩺" },
            { label:"Settings",          href:"/admin",          icon:"⚙️" },
          ].map(({ label, href, icon, active }) => (
            <a key={label} href={href}
              style={{ display:"flex", alignItems:"center", gap:10,
                       padding:"10px 14px", borderRadius:10, marginBottom:2,
                       fontSize:13, fontWeight:500, textDecoration:"none",
                       background: active ? "#F5F0FF" : "transparent",
                       color: active ? "#6D28D9" : "#555" }}>
              <span>{icon}</span>{label}
            </a>
          ))}
        </nav>
      </aside>

      {/* ── Main ── */}
      <main style={{ marginLeft:256, flex:1 }}>
        <header style={{ position:"sticky", top:0, zIndex:10, height:64,
                         display:"flex", alignItems:"center", justifyContent:"space-between",
                         padding:"0 32px", background:"#fff",
                         borderBottom:"1px solid #F0EEEA", boxShadow:"0 1px 4px rgba(0,0,0,.04)" }}>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:"#111" }}>Patient Management</div>
            <div style={{ fontSize:12, color:"#888" }}>View, edit and delete registered patients</div>
          </div>
          <a href="/admin" style={{ fontSize:13, color:"#6D28D9", textDecoration:"none",
                                    fontWeight:600, padding:"7px 14px", borderRadius:8,
                                    background:"#F5F0FF" }}>← Dashboard</a>
        </header>

        <div style={{ padding:32 }}>
          {/* Controls */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                        marginBottom:20, gap:12 }}>
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email…"
              style={{ flex:1, maxWidth:340, padding:"9px 14px", border:"1.5px solid #E2E0DC",
                       borderRadius:9, fontSize:14, outline:"none", background:"#fff" }}
            />
            <div style={{ fontSize:13, color:"#888", fontWeight:500 }}>
              {filtered.length} patient{filtered.length !== 1 ? "s" : ""}
            </div>
          </div>

          {/* Table */}
          <div style={{ background:"#fff", borderRadius:16, boxShadow:"0 1px 4px rgba(0,0,0,.06)",
                        overflow:"hidden" }}>
            {loading ? (
              <div style={{ padding:60, textAlign:"center", color:"#aaa", fontSize:14 }}>
                Loading patients…
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding:60, textAlign:"center", color:"#aaa", fontSize:14 }}>
                {search ? "No patients match your search." : "No patients registered yet."}
              </div>
            ) : (
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                  <thead>
                    <tr style={{ borderBottom:"1px solid #F0EEEA" }}>
                      {["Patient","Email","Date of Birth","Registered","Status","Actions"].map(h => (
                        <th key={h} style={{ padding:"12px 16px", textAlign:"left", fontSize:11,
                                             fontWeight:700, textTransform:"uppercase",
                                             letterSpacing:".05em", color:"#999", whiteSpace:"nowrap" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <tr key={p.id}
                        style={{ borderBottom:"1px solid #F8F7F5", transition:"background .1s" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFAF8")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                        {/* Name */}
                        <td style={{ padding:"13px 16px" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                            <div style={{ width:34, height:34, borderRadius:"50%", flexShrink:0,
                                          background:"#EDE9FE", color:"#6D28D9",
                                          display:"flex", alignItems:"center", justifyContent:"center",
                                          fontWeight:700, fontSize:13 }}>
                              {p.name.charAt(0).toUpperCase()}
                            </div>
                            <span style={{ fontWeight:600, color:"#111" }}>{p.name}</span>
                          </div>
                        </td>
                        {/* Email */}
                        <td style={{ padding:"13px 16px", color:"#555" }}>{p.email}</td>
                        {/* DOB */}
                        <td style={{ padding:"13px 16px", color:"#777" }}>
                          {fmt(p.patientProfile?.dateOfBirth)}
                        </td>
                        {/* Registered */}
                        <td style={{ padding:"13px 16px", color:"#777", whiteSpace:"nowrap" }}>
                          {fmt(p.createdAt)}
                        </td>
                        {/* Status */}
                        <td style={{ padding:"13px 16px" }}>
                          <span style={{ padding:"3px 10px", borderRadius:100, fontSize:11,
                                         fontWeight:700,
                                         background: p.isVerified ? "#ECFDF5" : "#FEF3C7",
                                         color:      p.isVerified ? "#065F46" : "#92400E" }}>
                            {p.isVerified ? "Active" : "Pending"}
                          </span>
                        </td>
                        {/* Actions */}
                        <td style={{ padding:"13px 16px" }}>
                          <div style={{ display:"flex", gap:8 }}>
                            <button onClick={() => openEdit(p)}
                              style={{ padding:"6px 14px", border:"1.5px solid #DDD",
                                       borderRadius:8, fontSize:12, fontWeight:600,
                                       cursor:"pointer", background:"#fff", color:"#333",
                                       transition:"background .1s" }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = "#F8F7F5")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}>
                              Edit
                            </button>
                            <button onClick={() => setDeleting(p)}
                              style={{ padding:"6px 14px", border:"1.5px solid #FCA5A5",
                                       borderRadius:8, fontSize:12, fontWeight:600,
                                       cursor:"pointer", background:"#FFF5F5", color:"#B91C1C",
                                       transition:"background .1s" }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = "#FEE2E2")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = "#FFF5F5")}>
                              Delete
                            </button>
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

      {/* ── Edit modal ── */}
      {editing && editState && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)",
                      display:"flex", alignItems:"center", justifyContent:"center", zIndex:50 }}>
          <div style={{ background:"#fff", borderRadius:18, padding:28, width:"100%",
                        maxWidth:440, boxShadow:"0 20px 60px rgba(0,0,0,.15)", margin:"0 16px" }}>
            <div style={{ fontSize:17, fontWeight:700, color:"#111", marginBottom:20 }}>
              Edit Patient
            </div>

            {([
              { key:"name",        label:"Full name",       type:"text",  placeholder:"John Smith" },
              { key:"email",       label:"Email address",   type:"email", placeholder:"you@gmail.com" },
              { key:"dateOfBirth", label:"Date of birth",   type:"date",  placeholder:"" },
            ] as const).map(({ key, label, type, placeholder }) => (
              <div key={key} style={{ marginBottom:14 }}>
                <label style={{ display:"block", fontSize:11, fontWeight:700,
                                 textTransform:"uppercase", letterSpacing:".06em",
                                 color:"#666", marginBottom:6 }}>{label}</label>
                <input
                  type={type} value={editState[key]}
                  placeholder={placeholder}
                  onChange={(e) => setEditState({ ...editState, [key]: e.target.value })}
                  style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #E2E0DC",
                           borderRadius:8, fontSize:14, outline:"none" }}
                />
              </div>
            ))}

            <label style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer",
                            marginBottom:22 }}>
              <input type="checkbox" checked={editState.isVerified}
                onChange={(e) => setEditState({ ...editState, isVerified: e.target.checked })}
                style={{ width:16, height:16, cursor:"pointer" }} />
              <span style={{ fontSize:13, color:"#555", fontWeight:500 }}>Account is active</span>
            </label>

            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => { setEditing(null); setEditState(null); }}
                style={{ flex:1, padding:"10px", border:"1.5px solid #E2E0DC", borderRadius:9,
                         fontSize:14, fontWeight:600, cursor:"pointer", background:"#fff",
                         color:"#555" }}>
                Cancel
              </button>
              <button onClick={saveEdit} disabled={saving}
                style={{ flex:1, padding:"10px", border:"none", borderRadius:9,
                         fontSize:14, fontWeight:600, cursor:"pointer",
                         background: saving ? "#9eaab5" : "#0C1929", color:"#fff" }}>
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm modal ── */}
      {deleting && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)",
                      display:"flex", alignItems:"center", justifyContent:"center", zIndex:50 }}>
          <div style={{ background:"#fff", borderRadius:18, padding:28, width:"100%",
                        maxWidth:380, boxShadow:"0 20px 60px rgba(0,0,0,.15)", margin:"0 16px" }}>
            <div style={{ width:44, height:44, background:"#FEE2E2", borderRadius:12,
                          display:"flex", alignItems:"center", justifyContent:"center",
                          fontSize:20, marginBottom:16 }}>🗑️</div>
            <div style={{ fontSize:17, fontWeight:700, color:"#111", marginBottom:8 }}>
              Delete patient?
            </div>
            <p style={{ fontSize:13.5, color:"#666", lineHeight:1.55, marginBottom:22 }}>
              This will permanently remove <strong>{deleting.name}</strong> ({deleting.email})
              and all their data. This action cannot be undone.
            </p>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setDeleting(null)}
                style={{ flex:1, padding:"10px", border:"1.5px solid #E2E0DC", borderRadius:9,
                         fontSize:14, fontWeight:600, cursor:"pointer",
                         background:"#fff", color:"#555" }}>
                Cancel
              </button>
              <button onClick={confirmDelete} disabled={delBusy}
                style={{ flex:1, padding:"10px", border:"none", borderRadius:9,
                         fontSize:14, fontWeight:600, cursor:"pointer",
                         background: delBusy ? "#FCA5A5" : "#B91C1C", color:"#fff" }}>
                {delBusy ? "Deleting…" : "Yes, delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
