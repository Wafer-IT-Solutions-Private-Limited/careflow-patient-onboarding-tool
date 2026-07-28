"use client";

import { usePathname, useRouter } from "next/navigation";

type Tab = "dashboard" | "patients" | "doctors";

const TABS: { id: Tab; label: string; href: string }[] = [
  { id: "dashboard", label: "Dashboard", href: "/admin" },
  { id: "patients",  label: "Patients",  href: "/admin/patients" },
  { id: "doctors",   label: "Doctors",   href: "/admin/doctors" },
];

export default function AdminHeader() {
  const router   = useRouter();
  const pathname = usePathname();

  const activeTab = TABS.find(t => t.href === pathname)?.id ?? "dashboard";

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  return (
    <header style={S.header}>
      <div style={S.inner}>
        <div style={S.brand}>
          <img src="/waferlogo.png" alt="Wafer" style={S.logo} />
          <span style={S.brandName}>Hospital Admin</span>
        </div>

        <nav style={S.tabNav}>
          {TABS.map(t => (
            <button
              key={t.id}
              style={{ ...S.navTab, ...(activeTab === t.id ? S.navTabActive : {}) }}
              onClick={() => router.push(t.href)}
            >
              {t.label}
            </button>
          ))}
          <button style={S.navTab} onClick={() => router.push("/walk-in")}>Walk-In</button>
        </nav>

        <button style={S.logoutBtn} onClick={logout}>Sign Out</button>
      </div>
    </header>
  );
}

const S: Record<string, React.CSSProperties> = {
  header:       { background: "#0C1929", padding: "0 24px", position: "sticky" as const, top: 0, zIndex: 50 },
  inner:        { maxWidth: 1280, margin: "0 auto", height: 60, display: "flex", alignItems: "center", gap: 24 },
  brand:        { display: "flex", alignItems: "center", gap: 10, flexShrink: 0 },
  logo:         { height: 28, filter: "brightness(0) invert(1)" },
  brandName:    { fontSize: 15, fontWeight: 700, color: "#fff" },
  tabNav:       { display: "flex", gap: 2, flex: 1, justifyContent: "center" },
  navTab:       { padding: "7px 20px", background: "transparent", color: "rgba(255,255,255,.6)", border: "none", borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: "pointer", transition: "all .15s" },
  navTabActive: { background: "rgba(255,255,255,.12)", color: "#fff" },
  logoutBtn:    { fontSize: 12.5, color: "rgba(255,255,255,.6)", background: "transparent", border: "1px solid rgba(255,255,255,.2)", borderRadius: 8, padding: "5px 12px", cursor: "pointer", flexShrink: 0 },
};
