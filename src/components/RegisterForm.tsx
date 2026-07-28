"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

export default function RegisterForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [form, setForm] = useState({
    name: "", phone: "", dateOfBirth: "", aadhaar: "",
    email: "", password: "", confirm: "",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim())        { toast.error("Full name is required"); return; }
    if (!form.phone.trim())       { toast.error("Phone number is required"); return; }
    if (!form.dateOfBirth)        { toast.error("Date of birth is required"); return; }
    if (!form.aadhaar.trim())     { toast.error("Aadhaar number is required"); return; }
    if (form.password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (form.password !== form.confirm) { toast.error("Passwords do not match"); return; }

    setLoading(true);
    try {
      const res  = await fetch("/api/auth/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:        form.name,
          phone:       form.phone,
          dateOfBirth: form.dateOfBirth,
          aadhaar:     form.aadhaar,
          email:       form.email || undefined,
          password:    form.password,
        }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error ?? "Registration failed"); return; }
      toast.success(`Welcome, ${json.user?.name ?? ""}! Account created.`);
      router.push(json.redirectTo);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally { setLoading(false); }
  };

  return (
    <>
      <div className="rf-root">
        <div className="rf-left">
          <div className="rf-inner">
            <div className="rf-brand">
              <img src="/waferlogo.png" alt="CareFlow" className="rf-brand-logo" />
              <span className="rf-brand-name">CareFlow</span>
            </div>

            <h1 className="rf-heading">Create your account</h1>
            <p className="rf-sub">Register to access your personal health portal.</p>

            <form onSubmit={onSubmit} noValidate className="rf-form">

              <div className="rf-field">
                <label className="rf-label">Full name <span className="rf-req">*</span></label>
                <input value={form.name} onChange={set("name")} type="text" placeholder="John Smith" autoComplete="name" className="rf-input" />
              </div>

              <div className="rf-field">
                <label className="rf-label">Phone number <span className="rf-req">*</span></label>
                <input value={form.phone} onChange={set("phone")} type="tel" placeholder="9876543210" autoComplete="tel" className="rf-input" />
              </div>

              <div className="rf-field">
                <label className="rf-label">Date of birth <span className="rf-req">*</span></label>
                <input value={form.dateOfBirth} onChange={set("dateOfBirth")} type="date" className="rf-input" />
              </div>

              <div className="rf-field">
                <label className="rf-label">Aadhaar number <span className="rf-req">*</span></label>
                <input value={form.aadhaar} onChange={set("aadhaar")} type="text" placeholder="1234 5678 9012" maxLength={14} className="rf-input" />
                <span className="rf-hint">Stored as a secure hash for duplicate prevention only.</span>
              </div>

              <div className="rf-field">
                <label className="rf-label">Email <span className="rf-opt">(optional — for notifications)</span></label>
                <input value={form.email} onChange={set("email")} type="email" placeholder="you@gmail.com" autoComplete="email" className="rf-input" />
              </div>

              <div className="rf-field">
                <label className="rf-label">Password <span className="rf-req">*</span></label>
                <div className="rf-pwd-row">
                  <input value={form.password} onChange={set("password")} type={showPwd ? "text" : "password"}
                    placeholder="Min. 8 characters" autoComplete="new-password" className="rf-input" />
                  <button type="button" className="rf-show" onClick={() => setShowPwd(v => !v)}>{showPwd ? "Hide" : "Show"}</button>
                </div>
              </div>

              <div className="rf-field">
                <label className="rf-label">Confirm password <span className="rf-req">*</span></label>
                <input value={form.confirm} onChange={set("confirm")} type={showPwd ? "text" : "password"}
                  placeholder="Repeat your password" autoComplete="new-password" className="rf-input" />
              </div>

              <button type="submit" disabled={loading} className="rf-submit">
                {loading ? "Creating account…" : "Create account"}
              </button>
            </form>

            <div className="rf-links">
              <span className="rf-muted">Already have an account?</span>
              <a href="/login" className="rf-link">Sign in</a>
            </div>
          </div>
        </div>

        <div className="rf-right">
          <div className="rf-right-inner">
            <div className="rf-ov-logo"><img src="/waferlogo.png" alt="CareFlow" className="rf-ov-logo-img" /></div>
            <div className="rf-ov-headline">Your health journey<br />starts here.</div>
            <p className="rf-ov-sub">Create a free account to access your personal health portal, manage appointments, and view your medical history.</p>
            <div className="rf-benefits">
              {[
                { icon: "🔒", text: "Your data is encrypted and private" },
                { icon: "📋", text: "View and track your medical records" },
                { icon: "📅", text: "Book and manage appointments" },
                { icon: "💬", text: "Communicate with your care team" },
              ].map(({ icon, text }) => (
                <div key={text} className="rf-benefit">
                  <span className="rf-benefit-icon">{icon}</span>
                  <span className="rf-benefit-text">{text}</span>
                </div>
              ))}
            </div>
            <div className="rf-note">Hospital staff? Contact your administrator for access.</div>
          </div>
        </div>
      </div>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .rf-root { display:grid; grid-template-columns:1fr 1fr; min-height:100vh; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif; }
        .rf-left { background:#F5F4F2; display:flex; align-items:center; justify-content:center; padding:40px 28px; }
        .rf-inner { width:100%; max-width:380px; }
        .rf-brand { display:flex; align-items:center; gap:10px; margin-bottom:24px; }
        .rf-brand-logo { height:34px; width:auto; object-fit:contain; }
        .rf-brand-name { font-size:17px; font-weight:700; color:#0C1929; letter-spacing:-.2px; }
        .rf-heading { font-size:26px; font-weight:700; color:#0C1929; letter-spacing:-.5px; line-height:1.15; margin-bottom:5px; }
        .rf-sub { font-size:13px; color:#888; margin-bottom:20px; }
        .rf-form { display:flex; flex-direction:column; }
        .rf-field { margin-bottom:13px; }
        .rf-label { display:block; font-size:11px; font-weight:700; letter-spacing:.07em; text-transform:uppercase; color:#666; margin-bottom:6px; }
        .rf-req { color:#DC2626; }
        .rf-opt { font-weight:400; text-transform:none; color:#aaa; letter-spacing:0; }
        .rf-hint { display:block; font-size:11px; color:#aaa; margin-top:4px; }
        .rf-input { width:100%; padding:10px 14px; border:1.5px solid #E2E0DC; border-radius:9px; font-size:14px; color:#111; background:#FDFCFB; outline:none; transition:border-color .15s; }
        .rf-input:focus { border-color:#0C1929; box-shadow:0 0 0 3px rgba(12,25,41,.09); background:#fff; }
        .rf-pwd-row { position:relative; }
        .rf-show { position:absolute; right:12px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; font-size:12px; font-weight:600; color:#999; }
        .rf-submit { width:100%; padding:12px; background:#0C1929; color:#fff; border:none; border-radius:9px; font-size:14.5px; font-weight:600; cursor:pointer; margin-top:6px; transition:background .15s; }
        .rf-submit:hover:not(:disabled) { background:#182d47; }
        .rf-submit:disabled { background:#9eaab5; cursor:not-allowed; }
        .rf-links { display:flex; justify-content:center; align-items:center; gap:8px; margin-top:16px; font-size:13px; }
        .rf-muted { color:#999; }
        .rf-link { color:#0C1929; font-weight:600; text-decoration:none; }
        .rf-link:hover { text-decoration:underline; }
        .rf-right { background:#0C1929; display:flex; align-items:center; justify-content:center; padding:48px 44px; }
        .rf-right-inner { max-width:360px; width:100%; }
        .rf-ov-logo { margin-bottom:32px; }
        .rf-ov-logo-img { height:32px; width:auto; object-fit:contain; filter:brightness(0) invert(1); }
        .rf-ov-headline { font-size:32px; font-weight:800; color:#fff; line-height:1.2; letter-spacing:-.8px; margin-bottom:16px; }
        .rf-ov-sub { font-size:14px; line-height:1.65; color:rgba(255,255,255,.62); margin-bottom:32px; }
        .rf-benefits { display:flex; flex-direction:column; gap:14px; margin-bottom:36px; }
        .rf-benefit { display:flex; align-items:center; gap:13px; }
        .rf-benefit-icon { font-size:18px; width:38px; height:38px; background:rgba(255,255,255,.10); border:1px solid rgba(255,255,255,.18); border-radius:10px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .rf-benefit-text { font-size:13.5px; color:rgba(255,255,255,.82); }
        .rf-note { padding:12px 16px; background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.12); border-radius:10px; font-size:12.5px; color:rgba(255,255,255,.50); }
        @media (max-width:820px) { .rf-root { grid-template-columns:1fr; } .rf-right { display:none; } }
      `}</style>
    </>
  );
}
