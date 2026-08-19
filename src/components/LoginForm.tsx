"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

type LoginMode = "staff" | "patient";

/* ─── SVG icons ──────────────────────────────────────────────────── */
const Icon = ({ d, d2 }: { d: string; d2?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
    <path d={d} />{d2 && <path d={d2} />}
  </svg>
);

const FEATURES = [
  { icon: <Icon d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />, title: "Patient Care",    desc: "Unified records & visit history" },
  { icon: <Icon d="M22 12h-4l-3 9L9 3l-3 9H2" />,                                                                                                                   title: "Live Monitoring", desc: "Real-time vitals & alerts" },
  { icon: <Icon d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" d2="M9 12l2 2 4-4" />,                                                                            title: "Secure Records",  desc: "Role-gated, encrypted access" },
  { icon: <Icon d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" d2="M9 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />, title: "Multi-role Access", desc: "Doctor · Patient · Admin" },
];

/* ─── Wave canvas ────────────────────────────────────────────────── */
function WaveCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf: number; let t = 0;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => { const W = canvas.clientWidth, H = canvas.clientHeight; canvas.width = W*dpr; canvas.height = H*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); };
    const ro = new ResizeObserver(resize); ro.observe(canvas); resize();
    function draw() {
      if (!canvas) { raf = requestAnimationFrame(draw); return; }
      const W = canvas.clientWidth, H = canvas.clientHeight;
      if (!W || !H) { raf = requestAnimationFrame(draw); return; }
      ctx.fillStyle = "#0C1929"; ctx.fillRect(0,0,W,H);
      const COUNT=16, SLOPE=0.50, GAP=0.28, SPACING=(H*1.75)/COUNT, RIB_H=SPACING*(1-GAP), FREQ=0.0080, AMP=18, SPEED=0.016;
      for (let i=0; i<=COUNT+3; i++) {
        const baseY=i*SPACING-H*0.38, phase=i*0.58;
        const waveAt=(x:number)=>baseY+x*SLOPE+Math.sin(x*FREQ+t*SPEED+phase)*AMP+Math.sin(x*FREQ*2.2+t*SPEED*0.6+phase+1.1)*AMP*0.20;
        ctx.beginPath();
        for (let x=0;x<=W;x++){const y=waveAt(x);x===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}
        for (let x=W;x>=0;x--)ctx.lineTo(x,waveAt(x)+RIB_H);
        ctx.closePath();
        const midY=waveAt(W/2), grad=ctx.createLinearGradient(0,midY,0,midY+RIB_H), tier=i%3;
        if(tier===0){grad.addColorStop(0,"rgba(252,249,244,0.97)");grad.addColorStop(0.10,"rgba(228,223,216,0.93)");grad.addColorStop(0.40,"rgba(185,180,173,0.89)");grad.addColorStop(0.72,"rgba(138,133,127,0.85)");grad.addColorStop(1,"rgba(82,78,74,0.80)");}
        else if(tier===1){grad.addColorStop(0,"rgba(232,227,220,0.92)");grad.addColorStop(0.15,"rgba(206,201,194,0.88)");grad.addColorStop(0.48,"rgba(163,158,152,0.85)");grad.addColorStop(0.78,"rgba(116,112,107,0.81)");grad.addColorStop(1,"rgba(70,67,63,0.77)");}
        else{grad.addColorStop(0,"rgba(205,200,194,0.88)");grad.addColorStop(0.20,"rgba(176,171,165,0.84)");grad.addColorStop(0.55,"rgba(138,134,128,0.81)");grad.addColorStop(0.82,"rgba(100,96,91,0.77)");grad.addColorStop(1,"rgba(62,59,55,0.73)");}
        ctx.fillStyle=grad; ctx.fill();
        ctx.beginPath();
        for(let x=0;x<=W;x++){const y=waveAt(x);x===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}
        ctx.strokeStyle="rgba(255,252,246,0.68)"; ctx.lineWidth=1.1; ctx.stroke();
      }
      t++; raf = requestAnimationFrame(draw);
    }
    draw();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return <canvas ref={ref} style={{ position:"absolute", inset:0, width:"100%", height:"100%" }} />;
}

/* ─── Login form ─────────────────────────────────────────────────── */
export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode]       = useState<LoginMode>("patient");
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  // Staff fields
  const [email,    setEmail]    = useState("");
  const [staffPwd, setStaffPwd] = useState("");

  // Patient fields
  const [identifier, setIdentifier] = useState("");
  const [patPwd,     setPatPwd]     = useState("");

  const submitStaff = async () => {
    if (!email || !staffPwd) { toast.error("Email and password are required"); return; }
    setLoading(true);
    try {
      const res  = await fetch("/api/auth/login", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ email, password: staffPwd }) });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error ?? "Login failed"); return; }
      toast.success(`Welcome, ${json.user?.name ?? ""}!`);
      router.push(json.redirectTo); router.refresh();
    } catch(e) { toast.error(e instanceof Error ? e.message : "Network error"); }
    finally { setLoading(false); }
  };

  const submitPatient = async () => {
    if (!identifier || !patPwd) { toast.error("Phone/PRN and password are required"); return; }
    setLoading(true);
    try {
      const res  = await fetch("/api/auth/patient-login", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ identifier, password: patPwd }) });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error ?? "Login failed"); return; }
      toast.success(`Welcome, ${json.user?.name ?? ""}!`);
      router.push(json.redirectTo); router.refresh();
    } catch(e) { toast.error(e instanceof Error ? e.message : "Network error"); }
    finally { setLoading(false); }
  };

  return (
    <>
      <div className="lp-root">
        {/* ══ LEFT ══ */}
        <div className="lp-left">
          <div className="lp-inner">
            <div className="lp-brand">
              <img src="/waferlogo.png" alt="CareFlow" className="lp-brand-logo" />
              <span className="lp-brand-name">CareFlow</span>
            </div>

            <h1 className="lp-heading">Sign in</h1>

            {/* Toggle */}
            <div className="lp-toggle">
              <button className={`lp-tog-btn${mode==="patient" ? " active" : ""}`} onClick={() => setMode("patient")}>Patient</button>
              <button className={`lp-tog-btn${mode==="staff"   ? " active" : ""}`} onClick={() => setMode("staff")}>Staff</button>
            </div>

            {mode === "patient" ? (
              <div className="lp-form">
                <div className="lp-field">
                  <label className="lp-label">Phone number or PRN</label>
                  <input value={identifier} onChange={e => setIdentifier(e.target.value)}
                    type="text" placeholder="9876543210 or PAT-20240101-0001"
                    autoComplete="username" className="lp-input"
                    onKeyDown={e => e.key === "Enter" && submitPatient()} />
                </div>
                <div className="lp-field">
                  <label className="lp-label">Password</label>
                  <div className="lp-pwd-row">
                    <input value={patPwd} onChange={e => setPatPwd(e.target.value)}
                      type={showPwd ? "text" : "password"} placeholder="••••••••"
                      autoComplete="current-password" className="lp-input"
                      onKeyDown={e => e.key === "Enter" && submitPatient()} />
                    <button type="button" className="lp-pwd-toggle" onClick={() => setShowPwd(v => !v)}>{showPwd ? "Hide" : "Show"}</button>
                  </div>
                </div>
                <button disabled={loading} className="lp-submit" onClick={submitPatient}>
                  {loading ? "Signing in…" : "Sign in"}
                </button>
              </div>
            ) : (
              <div className="lp-form">
                <div className="lp-field">
                  <label className="lp-label">Email address</label>
                  <input value={email} onChange={e => setEmail(e.target.value)}
                    type="email" placeholder="you@hospital.com"
                    autoComplete="email" className="lp-input"
                    onKeyDown={e => e.key === "Enter" && submitStaff()} />
                </div>
                <div className="lp-field">
                  <label className="lp-label">Password</label>
                  <div className="lp-pwd-row">
                    <input value={staffPwd} onChange={e => setStaffPwd(e.target.value)}
                      type={showPwd ? "text" : "password"} placeholder="••••••••"
                      autoComplete="current-password" className="lp-input"
                      onKeyDown={e => e.key === "Enter" && submitStaff()} />
                    <button type="button" className="lp-pwd-toggle" onClick={() => setShowPwd(v => !v)}>{showPwd ? "Hide" : "Show"}</button>
                  </div>
                </div>
                <button disabled={loading} className="lp-submit" onClick={submitStaff}>
                  {loading ? "Signing in…" : "Sign in"}
                </button>
              </div>
            )}

            <div className="lp-links">
              {mode === "patient" && <><a href="/register" className="lp-link">Create account</a><span className="lp-dot">·</span></>}
              <span className="lp-muted" style={{ fontSize: 12, color: "#aaa" }}>{mode === "patient" ? "Walk-in? Use your PRN or phone" : "Staff accounts managed by admin"}</span>
            </div>
          </div>
        </div>

        {/* ══ RIGHT ══ */}
        <div className="lp-right">
          <WaveCanvas />
          <div className="lp-scrim" />
          <div className="lp-overlay">
            <div className="lp-ov-top">
              <div className="lp-ov-logo"><img src="/waferlogo.png" alt="CareFlow" className="lp-ov-logo-img" /></div>
              <p className="lp-ov-tagline">Compassionate care, digital precision.</p>
            </div>
            <div className="lp-ov-grid">
              {FEATURES.map(f => (
                <div key={f.title} className="lp-ov-card">
                  <div className="lp-ov-card-icon">{f.icon}</div>
                  <div><div className="lp-ov-card-title">{f.title}</div><div className="lp-ov-card-desc">{f.desc}</div></div>
                </div>
              ))}
            </div>
            <div className="lp-ov-roles">{["Doctor","Patient","Admin"].map(r => <span key={r} className="lp-ov-pill">{r}</span>)}</div>
            <div className="lp-ov-stats">
              {[["3","Roles"],["256-bit","Encrypted"],["24 / 7","Access"]].map(([n,l],i,a) => (
                <div key={l} style={{ display:"flex", alignItems:"center", gap:20 }}>
                  <div className="lp-stat"><span className="lp-stat-n">{n}</span><span className="lp-stat-l">{l}</span></div>
                  {i < a.length-1 && <div className="lp-stat-sep" />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .lp-root { display: grid; grid-template-columns: 1fr 1fr; min-height: 100vh; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif; }
        .lp-left { background: #F5F4F2; display:flex; align-items:center; justify-content:center; padding:40px 28px; }
        .lp-inner { width:100%; max-width:360px; }
        .lp-brand { display:flex; align-items:center; gap:10px; margin-bottom:28px; }
        .lp-brand-logo { height:36px; width:auto; object-fit:contain; }
        .lp-brand-name { font-size:18px; font-weight:700; color:#0C1929; letter-spacing:-.3px; }
        .lp-heading { font-size:28px; font-weight:700; color:#0C1929; letter-spacing:-.6px; line-height:1.15; margin-bottom:20px; }

        /* Toggle */
        .lp-toggle { display:flex; background:#E8E6E3; border-radius:10px; padding:3px; margin-bottom:24px; }
        .lp-tog-btn { flex:1; padding:8px; border:none; border-radius:8px; font-size:13.5px; font-weight:600; cursor:pointer; background:transparent; color:#888; transition:all .15s; }
        .lp-tog-btn.active { background:#fff; color:#0C1929; box-shadow:0 1px 4px rgba(0,0,0,.12); }

        .lp-form { display:flex; flex-direction:column; gap:0; }
        .lp-field { margin-bottom:16px; }
        .lp-label { display:block; font-size:11px; font-weight:700; letter-spacing:.07em; text-transform:uppercase; color:#666; margin-bottom:7px; }
        .lp-input { width:100%; padding:11px 14px; border:1.5px solid #E2E0DC; border-radius:9px; font-size:14px; color:#111; background:#FDFCFB; outline:none; transition:border-color .15s,box-shadow .15s; }
        .lp-input:focus { border-color:#0C1929; box-shadow:0 0 0 3px rgba(12,25,41,.09); background:#fff; }
        .lp-pwd-row { position:relative; }
        .lp-pwd-toggle { position:absolute; right:12px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; font-size:12px; font-weight:600; color:#999; }
        .lp-pwd-toggle:hover { color:#333; }
        .lp-submit { width:100%; padding:12px; background:#0C1929; color:#fff; border:none; border-radius:9px; font-size:14.5px; font-weight:600; cursor:pointer; margin-top:6px; transition:background .15s,transform .1s; }
        .lp-submit:hover:not(:disabled) { background:#182d47; transform:translateY(-1px); }
        .lp-submit:disabled { background:#9eaab5; cursor:not-allowed; }
        .lp-links { display:flex; justify-content:center; align-items:center; gap:10px; margin-top:24px; font-size:13px; }
        .lp-link { color:#666; text-decoration:none; }
        .lp-link:hover { color:#0C1929; text-decoration:underline; }
        .lp-dot { color:#ccc; }
        .lp-muted { color:#aaa; }

        /* Right */
        .lp-right { position:relative; overflow:hidden; background:#0C1929; }
        .lp-scrim { position:absolute; inset:0; background:rgba(4,9,18,.54); pointer-events:none; }
        .lp-overlay { position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center; padding:44px 40px; gap:28px; }
        .lp-ov-top {}
        .lp-ov-logo { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
        .lp-ov-logo-img { height:34px; width:auto; object-fit:contain; filter:brightness(0) invert(1); }
        .lp-ov-tagline { font-size:14px; line-height:1.6; color:rgba(255,255,255,.78); max-width:300px; }
        .lp-ov-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .lp-ov-card { background:rgba(255,255,255,.14); border:1px solid rgba(255,255,255,.28); border-radius:12px; padding:14px; display:flex; align-items:flex-start; gap:11px; backdrop-filter:blur(8px); }
        .lp-ov-card-icon { color:#93c5fd; flex-shrink:0; margin-top:1px; }
        .lp-ov-card-title { font-size:13px; font-weight:700; color:#fff; margin-bottom:3px; }
        .lp-ov-card-desc { font-size:11.5px; line-height:1.4; color:rgba(255,255,255,.70); }
        .lp-ov-roles { display:flex; gap:8px; flex-wrap:wrap; }
        .lp-ov-pill { padding:5px 16px; border-radius:100px; font-size:12px; font-weight:600; color:#fff; border:1px solid rgba(255,255,255,.40); background:rgba(255,255,255,.14); }
        .lp-ov-stats { display:flex; align-items:center; gap:0; padding-top:22px; border-top:1px solid rgba(255,255,255,.22); }
        .lp-stat { display:flex; flex-direction:column; gap:2px; }
        .lp-stat-n { font-size:16px; font-weight:800; color:#fff; }
        .lp-stat-l { font-size:10.5px; font-weight:600; color:rgba(255,255,255,.60); text-transform:uppercase; letter-spacing:.07em; }
        .lp-stat-sep { width:1px; height:28px; background:rgba(255,255,255,.22); }
        @media (max-width:820px) { .lp-root { grid-template-columns:1fr; } .lp-right { display:none; } }
      `}</style>
    </>
  );
}
