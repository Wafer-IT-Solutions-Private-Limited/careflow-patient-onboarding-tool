"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type Tab = "dashboard" | "patients" | "doctors" | "visits" | "audit";

const TABS: { id: Tab; label: string; href: string }[] = [
  { id: "dashboard", label: "Dashboard",  href: "/admin" },
  { id: "patients",  label: "Patients",   href: "/admin/patients" },
  { id: "doctors",   label: "Doctors",    href: "/admin/doctors" },
  { id: "visits",    label: "All Visits", href: "/admin/visits" },
  { id: "audit",     label: "Audit Log",  href: "/admin/audit" },
];

export default function AdminHeader() {
  const router   = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const active = TABS.find(t => t.href === pathname)?.id ?? "dashboard";

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  return (
    <>
      <header className="ah-header">
        <div className="ah-inner">
          <div className="ah-brand">
            <img src="/waferlogo.png" alt="Wafer" className="ah-logo" />
            <span className="ah-name">Hospital Admin</span>
          </div>

          <nav className="ah-nav">
            {TABS.map(t => (
              <button key={t.id} className={`ah-tab${active === t.id ? " ah-active" : ""}`} onClick={() => router.push(t.href)}>
                {t.label}
              </button>
            ))}
            <button className="ah-tab" onClick={() => router.push("/walk-in")}>Walk-In</button>
          </nav>

          <div className="ah-right">
            <button className="ah-signout" onClick={logout}>Sign Out</button>
            <button className="ah-burger" onClick={() => setOpen(v => !v)} aria-label="Toggle menu">
              <span /><span /><span />
            </button>
          </div>
        </div>

        {open && (
          <div className="ah-mobile-menu">
            {TABS.map(t => (
              <button key={t.id}
                className={`ah-mobile-tab${active === t.id ? " ah-mobile-active" : ""}`}
                onClick={() => { router.push(t.href); setOpen(false); }}>
                {t.label}
              </button>
            ))}
            <button className="ah-mobile-tab" onClick={() => { router.push("/walk-in"); setOpen(false); }}>Walk-In</button>
            <button className="ah-mobile-tab ah-mobile-out" onClick={logout}>Sign Out</button>
          </div>
        )}
      </header>

      <style>{`
        .ah-header { background: #0C1929; position: sticky; top: 0; z-index: 50; }
        .ah-inner  { max-width: 1280px; margin: 0 auto; height: 60px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 0 20px; }
        .ah-brand  { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
        .ah-logo   { height: 28px; filter: brightness(0) invert(1); }
        .ah-name   { font-size: 15px; font-weight: 700; color: #fff; }
        .ah-nav    { display: flex; gap: 2px; }
        .ah-tab    { padding: 7px 16px; background: transparent; color: rgba(255,255,255,.6); border: none; border-radius: 8px; font-size: 13.5px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all .15s; font-family: inherit; }
        .ah-tab:hover { color: #fff; background: rgba(255,255,255,.08); }
        .ah-active { background: rgba(255,255,255,.12) !important; color: #fff !important; }
        .ah-right  { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .ah-signout{ font-size: 12.5px; color: rgba(255,255,255,.6); background: transparent; border: 1px solid rgba(255,255,255,.2); border-radius: 8px; padding: 5px 12px; cursor: pointer; font-family: inherit; }
        .ah-burger { display: none; flex-direction: column; justify-content: center; gap: 5px; background: none; border: none; cursor: pointer; padding: 4px; }
        .ah-burger span { display: block; width: 22px; height: 2px; background: rgba(255,255,255,.75); border-radius: 2px; }
        .ah-mobile-menu { background: #0f2236; border-top: 1px solid rgba(255,255,255,.1); padding: 8px 16px 14px; display: flex; flex-direction: column; gap: 2px; }
        .ah-mobile-tab  { display: block; width: 100%; text-align: left; padding: 11px 14px; background: none; border: none; color: rgba(255,255,255,.7); font-size: 14px; font-weight: 600; cursor: pointer; border-radius: 9px; font-family: inherit; }
        .ah-mobile-tab:hover { background: rgba(255,255,255,.07); color: #fff; }
        .ah-mobile-active { background: rgba(255,255,255,.12) !important; color: #fff !important; }
        .ah-mobile-out { color: rgba(255,90,90,.8); margin-top: 6px; border-top: 1px solid rgba(255,255,255,.08); padding-top: 14px; }
        @media (max-width: 1023px) {
          .ah-nav     { display: none; }
          .ah-signout { display: none; }
          .ah-burger  { display: flex; }
        }
      `}</style>
    </>
  );
}
