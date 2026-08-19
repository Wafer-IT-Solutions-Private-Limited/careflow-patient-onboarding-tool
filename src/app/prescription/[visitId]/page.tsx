"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface HistoryRecord {
  prescription: string;
  healthNotes: string;
  consultationStart: string;
  consultationEnd?: string;
  duration?: number;
  doctor: { specialization: string; licenseNumber: string; user: { name: string } };
  visit: { token: string; visitDate: string; visitId: string; paymentType?: string };
}

interface PrescriptionData {
  history: HistoryRecord;
  patient: { name: string; prn: string };
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

export default function PrescriptionPage() {
  const { visitId } = useParams<{ visitId: string }>();
  const [data,  setData]  = useState<PrescriptionData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/patient/prescription/${visitId}`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d); })
      .catch(() => setError("Failed to load prescription"));
  }, [visitId]);

  if (error) return (
    <div style={S.errorPage}>
      <div style={S.errorCard}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#111", marginBottom: 8 }}>Prescription Unavailable</div>
        <div style={{ fontSize: 14, color: "#666", marginBottom: 24 }}>{error}</div>
        <button style={S.backBtn} onClick={() => window.history.back()}>← Go Back</button>
      </div>
    </div>
  );

  if (!data) return (
    <div style={S.errorPage}>
      <div style={{ fontSize: 14, color: "#888" }}>Loading…</div>
    </div>
  );

  const { history, patient } = data;
  const rxLines    = history.prescription.split(/\n/).map(l => l.trim()).filter(Boolean);
  const noteLines  = history.healthNotes.split(/\n/).map(l => l.trim()).filter(Boolean);

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          .rx-page  { padding: 0 !important; background: #fff !important; }
          .rx-sheet { box-shadow: none !important; border-radius: 0 !important; max-width: 100% !important; }
        }
        @page { size: A4; margin: 14mm 14mm; }
        * { box-sizing: border-box; }
      `}</style>

      <div className="rx-page" style={S.page}>
        {/* Toolbar */}
        <div className="no-print" style={S.toolbar}>
          <button style={S.backBtn} onClick={() => window.history.back()}>← Back</button>
          <button style={S.printBtn} onClick={() => window.print()}>🖨️ &nbsp;Print / Save as PDF</button>
        </div>

        <div className="rx-sheet" style={S.sheet}>

          {/* ── Header band ── */}
          <div style={S.header}>
            <div style={S.brandRow}>
              <div style={S.logoBox}>
                <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
                  <rect width="26" height="26" rx="6" fill="rgba(255,255,255,.15)"/>
                  <path d="M7 13h12M13 7v12" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"/>
                </svg>
              </div>
              <div>
                <div style={S.brandName}>CareFlow</div>
                <div style={S.brandSub}>Hospital Management System</div>
              </div>
            </div>
            <div style={S.rxBadge}>℞ &nbsp;PRESCRIPTION</div>
          </div>

          {/* ── Info grid ── */}
          <div style={S.infoRow}>
            <div style={S.infoCol}>
              <div style={S.colHead}>PATIENT</div>
              <div style={S.colName}>{patient.name}</div>
              <div style={S.colMeta}>PRN &nbsp;<strong>{patient.prn}</strong></div>
            </div>
            <div style={{ ...S.infoCol, borderLeft: "1px solid #EAE8E4", borderRight: "1px solid #EAE8E4" }}>
              <div style={S.colHead}>CONSULTING DOCTOR</div>
              <div style={S.colName}>Dr. {history.doctor.user.name}</div>
              <div style={S.colMeta}>{history.doctor.specialization}</div>
              <div style={S.colMeta}>Reg. No: {history.doctor.licenseNumber}</div>
            </div>
            <div style={S.infoCol}>
              <div style={S.colHead}>VISIT</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111", marginBottom: 3 }}>{fmtDate(history.visit.visitDate)}</div>
              <div style={S.colMeta}>Consulted at {fmtTime(history.consultationStart)}</div>
              <div style={S.colMeta}>Token &nbsp;<strong>{history.visit.token}</strong></div>
            </div>
          </div>

          <div style={S.rule} />

          {/* ── Clinical Notes ── */}
          <div style={S.body}>
            <div style={S.sectionHead}>
              <span style={S.sectionDot} />
              CLINICAL NOTES
            </div>
            <div style={S.notesBox}>
              {noteLines.length > 0
                ? <ul style={S.noteList}>{noteLines.map((l, i) => <li key={i} style={S.noteItem}>{l}</li>)}</ul>
                : <span style={{ color: "#aaa", fontSize: 13 }}>No clinical notes recorded.</span>
              }
            </div>
          </div>

          {/* ── Prescription ── */}
          <div style={{ ...S.body, paddingTop: 0 }}>
            <div style={S.sectionHead}>
              <span style={{ ...S.sectionDot, background: "#2563EB" }} />
              MEDICINES &amp; INSTRUCTIONS
            </div>
            <div style={S.rxBox}>
              {rxLines.map((line, i) => (
                <div key={i} style={S.rxItem}>
                  <div style={S.rxNum}>{i + 1}</div>
                  <div style={S.rxText}>{line}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={S.rule} />

          {/* ── Footer ── */}
          <div style={S.footer}>
            <div>
              <div style={S.footNote}>This prescription is digitally generated by CareFlow HMS.</div>
              <div style={S.footNote}>Valid for a single course of treatment as advised by the consulting physician.</div>
            </div>
            <div style={S.sigBlock}>
              <div style={S.sigLine} />
              <div style={S.sigName}>Dr. {history.doctor.user.name}</div>
              <div style={S.sigSub}>{history.doctor.specialization}</div>
            </div>
          </div>

          <div style={S.strip}>
            Issued: {fmtDate(history.visit.visitDate)} &nbsp;·&nbsp; Visit&nbsp;{history.visit.visitId} &nbsp;·&nbsp; CareFlow HMS
          </div>
        </div>
      </div>
    </>
  );
}

const S: Record<string, React.CSSProperties> = {
  // page shell
  page:     { minHeight: "100vh", background: "#EDEBE7", padding: "28px 16px 52px", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif" },
  toolbar:  { maxWidth: 740, margin: "0 auto 18px", display: "flex", justifyContent: "space-between", alignItems: "center" },
  backBtn:  { padding: "8px 18px", background: "transparent", border: "1.5px solid #BDB9B2", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#444", cursor: "pointer" },
  printBtn: { padding: "10px 24px", background: "#0C1929", color: "#fff", border: "none", borderRadius: 9, fontSize: 13.5, fontWeight: 600, cursor: "pointer" },
  sheet:    { maxWidth: 740, margin: "0 auto", background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 6px 48px rgba(0,0,0,.13)" },

  // header
  header:    { background: "#0C1929", padding: "26px 36px 22px", display: "flex", justifyContent: "space-between", alignItems: "center" },
  brandRow:  { display: "flex", alignItems: "center", gap: 12 },
  logoBox:   { width: 42, height: 42, background: "rgba(255,255,255,.1)", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center" },
  brandName: { fontSize: 19, fontWeight: 800, color: "#fff", letterSpacing: "-.2px" },
  brandSub:  { fontSize: 10.5, color: "rgba(255,255,255,.5)", marginTop: 2 },
  rxBadge:   { fontSize: 11.5, fontWeight: 800, letterSpacing: ".12em", color: "rgba(255,255,255,.65)", border: "1.5px solid rgba(255,255,255,.2)", borderRadius: 7, padding: "5px 13px" },

  // info grid
  infoRow:  { display: "grid", gridTemplateColumns: "1fr 1fr 1fr" },
  infoCol:  { padding: "22px 28px" },
  colHead:  { fontSize: 9, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase" as const, color: "#B0A898", marginBottom: 7 },
  colName:  { fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 4 },
  colMeta:  { fontSize: 12, color: "#666", marginBottom: 2, lineHeight: 1.5 },

  // dividers and body
  rule:       { height: 1, background: "#EAE8E4", margin: "0 28px" },
  body:       { padding: "22px 36px" },
  sectionHead:{ display: "flex", alignItems: "center", gap: 8, fontSize: 9.5, fontWeight: 800, letterSpacing: ".11em", textTransform: "uppercase" as const, color: "#A0998F", marginBottom: 12 },
  sectionDot: { width: 8, height: 8, borderRadius: "50%", background: "#059669", flexShrink: 0 },

  // notes
  notesBox:  { background: "#F8F7F5", borderRadius: 10, padding: "14px 18px", border: "1px solid #EAE8E4" },
  noteList:  { margin: 0, paddingLeft: 16 },
  noteItem:  { fontSize: 13.5, color: "#333", lineHeight: 1.7, marginBottom: 2 },

  // prescription
  rxBox:  { background: "#EFF6FF", borderRadius: 10, padding: "14px 18px", border: "1px solid #DBEAFE" },
  rxItem: { display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10 },
  rxNum:  { width: 22, height: 22, borderRadius: "50%", background: "#2563EB", color: "#fff", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 },
  rxText: { fontSize: 13.5, color: "#1E3A6E", lineHeight: 1.65, fontWeight: 500 },

  // footer
  footer:   { padding: "18px 36px 22px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24 },
  footNote: { fontSize: 11, color: "#A0998F", lineHeight: 1.6 },
  sigBlock: { textAlign: "right" as const, flexShrink: 0 },
  sigLine:  { width: 150, height: 1, background: "#333", marginBottom: 6, marginLeft: "auto" },
  sigName:  { fontSize: 12.5, fontWeight: 700, color: "#111" },
  sigSub:   { fontSize: 11, color: "#888", marginTop: 2 },
  strip:    { background: "#F8F7F5", borderTop: "1px solid #EAE8E4", padding: "9px 36px", fontSize: 10, color: "#B0A898", letterSpacing: ".03em" },

  // error
  errorPage: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F5F4F2", fontFamily: "system-ui,sans-serif" },
  errorCard: { background: "#fff", borderRadius: 16, padding: "44px 52px", textAlign: "center" as const, boxShadow: "0 2px 20px rgba(0,0,0,.08)" },
};
