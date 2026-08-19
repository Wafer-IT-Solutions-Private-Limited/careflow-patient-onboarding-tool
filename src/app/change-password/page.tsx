"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [form, setForm]       = useState({ newPassword: "", confirm: "" });
  const [show, setShow]       = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (form.newPassword.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (form.newPassword !== form.confirm) { toast.error("Passwords do not match"); return; }
    setLoading(true);
    try {
      const res  = await fetch("/api/auth/change-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: form.newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed to change password"); return; }
      toast.success("Password updated! Please complete your health profile.");
      router.push(data.redirectTo);
      router.refresh();
    } finally { setLoading(false); }
  };

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.badge}>Security</div>
        <h1 style={S.title}>Set Your Password</h1>
        <p style={S.sub}>
          Your account was created by hospital reception. Please set a personal password to secure your account.
        </p>

        <div style={S.field}>
          <label style={S.label}>New Password</label>
          <div style={{ position: "relative" }}>
            <input
              style={S.input} type={show ? "text" : "password"}
              placeholder="Min. 8 characters"
              value={form.newPassword} onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))}
            />
            <button type="button" style={S.toggle} onClick={() => setShow(v => !v)}>{show ? "Hide" : "Show"}</button>
          </div>
        </div>

        <div style={S.field}>
          <label style={S.label}>Confirm Password</label>
          <input
            style={S.input} type={show ? "text" : "password"}
            placeholder="Repeat your password"
            value={form.confirm} onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
          />
        </div>

        <button style={{ ...S.btn, opacity: loading ? 0.7 : 1 }} onClick={submit} disabled={loading}>
          {loading ? "Saving…" : "Set Password & Continue"}
        </button>

        <p style={S.hint}>You will be directed to complete your health profile next.</p>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page:   { minHeight: "100vh", background: "#F5F4F2", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif" },
  card:   { background: "#fff", borderRadius: 16, padding: "40px 44px", width: "100%", maxWidth: 440, boxShadow: "0 2px 24px rgba(0,0,0,.08)" },
  badge:  { display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" as const, color: "#0C1929", background: "#E8EEF8", padding: "4px 10px", borderRadius: 20, marginBottom: 14 },
  title:  { fontSize: 24, fontWeight: 700, color: "#0C1929", marginBottom: 8 },
  sub:    { fontSize: 13.5, color: "#666", lineHeight: 1.55, marginBottom: 28 },
  field:  { marginBottom: 16 },
  label:  { display: "block", fontSize: 11, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase" as const, color: "#555", marginBottom: 6 },
  input:  { width: "100%", padding: "11px 14px", border: "1.5px solid #E2E0DC", borderRadius: 9, fontSize: 14, outline: "none", boxSizing: "border-box" as const, color: "#111", background: "#FDFCFB" },
  toggle: { position: "absolute" as const, right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#999" },
  btn:    { width: "100%", padding: "12px", background: "#0C1929", color: "#fff", border: "none", borderRadius: 9, fontSize: 14.5, fontWeight: 600, cursor: "pointer", marginTop: 8 },
  hint:   { fontSize: 12, color: "#aaa", textAlign: "center" as const, marginTop: 16, lineHeight: 1.5 },
};
