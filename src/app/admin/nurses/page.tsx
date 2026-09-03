"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import toast, { Toaster } from "react-hot-toast";
import AdminHeader from "@/components/admin/AdminHeader";

interface Nurse {
  id: string;
  approved: boolean;
  user: { id: string; name: string; email: string; isVerified: boolean; createdAt: string };
}

export default function NursesPage() {
  const router = useRouter();
  const [nurses,  setNurses]  = useState<Nurse[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding,  setAdding]  = useState(false);
  const [busy,    setBusy]    = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/nurses");
      if (res.status === 401 || res.status === 403) { router.push("/login"); return; }
      const d = await res.json();
      setNurses(d.nurses ?? []);
    } finally { setLoading(false); }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const addNurse = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      toast.error("All fields are required"); return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/nurses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error ?? "Failed"); return; }
      toast.success("Nurse added");
      setAdding(false);
      setForm({ name: "", email: "", password: "" });
      load();
    } finally { setBusy(false); }
  };

  const inp: React.CSSProperties = { padding: "9px 12px", border: "1.5px solid #E2E0DC", borderRadius: 8, fontSize: 13, outline: "none", background: "#FDFCFB", color: "#111", width: "100%" };

  return (
    <div style={{ minHeight: "100vh", background: "#F5F4F2", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif" }}>
      <Toaster position="top-right" />
      <AdminHeader />

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#0C1929" }}>Nurses</div>
            <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>Manage nursing staff accounts</div>
          </div>
          <button onClick={() => setAdding(true)} style={{ background: "#0C1929", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            + Add Nurse
          </button>
        </div>

        <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 1px 6px rgba(0,0,0,.05)", overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: "60px 0", textAlign: "center", color: "#aaa" }}>Loading…</div>
          ) : nurses.length === 0 ? (
            <div style={{ padding: "60px 0", textAlign: "center", color: "#aaa" }}>No nurses added yet.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1.5px solid #F0EEEA", background: "#FAFAF8" }}>
                  {["Name", "Email", "Status", "Added"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#999" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {nurses.map(n => (
                  <tr key={n.id} style={{ borderBottom: "1px solid #F8F7F5" }}>
                    <td style={{ padding: "12px 14px", fontWeight: 600, color: "#111" }}>{n.user.name}</td>
                    <td style={{ padding: "12px 14px", fontSize: 13, color: "#555" }}>{n.user.email}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 10, background: n.user.isVerified ? "#D1FAE5" : "#FEE2E2", color: n.user.isVerified ? "#065F46" : "#991B1B" }}>
                        {n.user.isVerified ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px", fontSize: 12, color: "#888" }}>
                      {new Date(n.user.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* Add Nurse Modal */}
      {adding && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }} onClick={() => setAdding(false)}>
          <div style={{ background: "#fff", borderRadius: 18, padding: 28, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,.15)" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#111", marginBottom: 20 }}>Add Nurse</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
              {[
                { key: "name",     label: "Full Name",  placeholder: "Nurse full name",                    type: "text" },
                { key: "email",    label: "Email",      placeholder: "firstname.nurse@hospital.com",        type: "email" },
                { key: "password", label: "Password",   placeholder: "Temporary password (min 8 chars)",   type: "password" },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: ".04em", display: "block", marginBottom: 4 }}>{f.label}</label>
                  <input type={f.type} placeholder={f.placeholder} value={form[f.key as keyof typeof form]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={inp} />
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: "#888", background: "#F8F7F5", borderRadius: 8, padding: "8px 12px", marginBottom: 16 }}>
              Email must follow: <strong>firstname.nurse@hospital.com</strong>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setAdding(false)} style={{ flex: 1, padding: 10, background: "transparent", border: "1.5px solid #D0CEC9", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#666" }}>Cancel</button>
              <button onClick={addNurse} disabled={busy} style={{ flex: 2, padding: 10, background: busy ? "#6B7280" : "#0C1929", color: "#fff", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer" }}>
                {busy ? "Adding…" : "Add Nurse"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`input::placeholder { color: #aaa !important; opacity: 1; }`}</style>
    </div>
  );
}
