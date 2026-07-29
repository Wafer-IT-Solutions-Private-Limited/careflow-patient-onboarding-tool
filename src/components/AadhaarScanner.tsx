"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { decodeAadhaarQR }     from "@/lib/aadhaar/qr-decoder";
import { mapQRToForm }         from "@/lib/aadhaar/field-mapper";
import type { AadhaarFormFields } from "@/lib/aadhaar/field-mapper";

type Phase = "camera" | "preview" | "processing" | "confirm" | "retry";

interface RetryInfo { reason: string; suggestion: string; }
interface Props { onComplete: (fields: AadhaarFormFields) => void; onClose: () => void; }

// ── Card guide (ISO/IEC 7810 ID-1 landscape) ─────────────────────────────────
const CARD_RATIO  = 1.586;
const CARD_MARGIN = 0.06;

function cardRect(w: number, h: number) {
  const cw = w * (1 - 2 * CARD_MARGIN);
  const ch = cw / CARD_RATIO;
  return { cx: w * CARD_MARGIN, cy: (h - ch) / 2, cw, ch };
}

function drawGuide(canvas: HTMLCanvasElement, w: number, h: number) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  const { cx, cy, cw, ch } = cardRect(w, h);

  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, w, h);
  ctx.clearRect(cx, cy, cw, ch);

  const cl = Math.min(cw, ch) * 0.13;
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth   = 3.5;
  ctx.lineCap     = "round";

  for (const [x1, y1, x2, y2, x3, y3] of [
    [cx,        cy + cl,  cx,      cy,      cx + cl,      cy      ],
    [cx+cw-cl,  cy,       cx+cw,   cy,      cx+cw,        cy+cl   ],
    [cx,        cy+ch-cl, cx,      cy+ch,   cx+cl,        cy+ch   ],
    [cx+cw-cl,  cy+ch,    cx+cw,   cy+ch,   cx+cw,        cy+ch-cl],
  ] as [number,number,number,number,number,number][]) {
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.lineTo(x3,y3); ctx.stroke();
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AadhaarScanner({ onComplete, onClose }: Props) {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const captureRef = useRef<HTMLCanvasElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);

  const [phase,           setPhase]          = useState<Phase>("camera");
  const [fields,          setFields]         = useState<AadhaarFormFields>({});
  const [aadhaarVerified, setAadhaarVerified] = useState<boolean | null>(null);
  const [camError,        setCamError]       = useState<string | null>(null);
  const [capturedURL,     setCapturedURL]    = useState<string | null>(null);
  const [retryInfo,       setRetryInfo]      = useState<RetryInfo | null>(null);

  // ── Camera lifecycle ──────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      videoRef.current!.srcObject = stream;
      await videoRef.current!.play();
    } catch {
      setCamError("Camera access denied. Please allow camera permission and try again.");
    }
  }, []);

  useEffect(() => { startCamera(); return () => stopCamera(); }, [startCamera, stopCamera]);

  // ── Draw framing guide (RAF loop, camera phase only) ─────────────────────
  useEffect(() => {
    if (phase !== "camera") return;
    let raf: number;
    const loop = () => {
      const v = videoRef.current, o = overlayRef.current;
      if (v && o && v.readyState >= 2 && v.videoWidth) {
        o.width = v.videoWidth; o.height = v.videoHeight;
        drawGuide(o, v.videoWidth, v.videoHeight);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // ── Capture ──────────────────────────────────────────────────────────────
  const capturePhoto = useCallback(() => {
    const v = videoRef.current, c = captureRef.current;
    if (!v || !c || v.readyState < 2) return;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d", { willReadFrequently: true })!.drawImage(v, 0, 0, c.width, c.height);
    stopCamera();
    setCapturedURL(c.toDataURL("image/jpeg", 0.92));
    setPhase("preview");
  }, [stopCamera]);

  // ── Analyse ───────────────────────────────────────────────────────────────
  const analysePhoto = useCallback(async () => {
    setPhase("processing");
    const c = captureRef.current;
    if (!c) return;

    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    const { cx, cy, cw, ch } = cardRect(c.width, c.height);

    const { assessFrameQuality, ocrAadhaarNumber } = await import("@/lib/aadhaar/ocr-processor");
    const q = assessFrameQuality(ctx, cx, cy, cw, ch);

    if (!q.ready) {
      setRetryInfo({
        reason: q.brightness === "low"  ? "Image too dark"
               : q.brightness === "high" ? "Too much glare"
               : "Image is blurry",
        suggestion: q.brightness === "low"
          ? "Move to a brighter area or turn on a light."
          : q.brightness === "high"
          ? "Tilt the card slightly to avoid direct light reflections."
          : "Hold the phone very still and wait for the camera to focus before tapping Capture.",
      });
      setPhase("retry");
      return;
    }

    try {
      const { readBarcodesFromImageData } = await import("zxing-wasm/reader");
      const results = await readBarcodesFromImageData(
        ctx.getImageData(0, 0, c.width, c.height),
        { formats: ["QRCode"], tryHarder: true },
      );
      const text = results[0]?.text;
      if (text) {
        const decoded = decodeAadhaarQR(text);
        if (decoded) {
          const aaRes = await ocrAadhaarNumber(c, { cx, cy, cw, ch });
          setAadhaarVerified(aaRes.verified);
          setFields({ ...mapQRToForm(decoded), aadhaarNumber: aaRes.number ?? undefined });
          setPhase("confirm");
          return;
        }
      }
    } catch { /* treat as not found */ }

    setRetryInfo({
      reason: "QR code not detected",
      suggestion: "Make sure the full back of the card is in frame and the QR code is not covered or damaged. Try better lighting.",
    });
    setPhase("retry");
  }, []);

  // ── Retake ────────────────────────────────────────────────────────────────
  const retake = useCallback(async () => {
    setRetryInfo(null);
    setCapturedURL(null);
    await startCamera();
    setPhase("camera");
  }, [startCamera]);

  const setField = (k: keyof AadhaarFormFields) => (v: string) =>
    setFields(f => ({ ...f, [k]: v }));

  // ── Confirm screen ────────────────────────────────────────────────────────
  if (phase === "confirm") {
    return (
      <div style={S.backdrop}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}} @media(max-width:500px){.acgrid{grid-template-columns:1fr!important}}`}</style>
        <div style={S.confirmCard}>
          <div style={S.confirmHeader}>
            <span style={S.confirmTitle}>Review Extracted Details</span>
            <button style={S.xBtn} onClick={onClose}>✕</button>
          </div>
          <p style={S.confirmSub}>QR decoded — confirm details and apply.</p>

          <div className="acgrid" style={S.confirmGrid}>
            {([
              ["Full Name",     "name",        "text"],
              ["Date of Birth", "dateOfBirth", "date"],
              ["Gender",        "gender",      "select"],
              ["Address",       "address",     "text"],
              ["City / VTC",    "city",        "text"],
              ["State",         "state",       "text"],
              ["Pincode",       "pincode",     "text"],
            ] as [string, keyof AadhaarFormFields, string][]).map(([label, key, type]) => (
              <div key={key} style={{ display:"flex", flexDirection:"column", gap:4 }}>
                <label style={S.fLabel}>{label}</label>
                {type === "select" ? (
                  <select style={S.fInput} value={fields[key] ?? ""}
                    onChange={e => setField(key)(e.target.value)}>
                    <option value="">Select</option>
                    <option>Male</option><option>Female</option><option>Other</option>
                  </select>
                ) : (
                  <input style={S.fInput} type={type} value={fields[key] ?? ""}
                    onChange={e => setField(key)(e.target.value)} placeholder={label} />
                )}
              </div>
            ))}

            <div style={{ display:"flex", flexDirection:"column", gap:4, gridColumn:"1 / -1" }}>
              <label style={S.fLabel}>
                Aadhaar Number
                {aadhaarVerified === true  && <span style={S.verifiedBadge}>✓ Verified</span>}
                {aadhaarVerified === false && <span style={S.unverifiedBadge}>⚠ Unverified — check manually</span>}
              </label>
              <input style={S.fInput} type="text" value={fields.aadhaarNumber ?? ""}
                onChange={e => setField("aadhaarNumber")(e.target.value)}
                placeholder="xxxx xxxx xxxx" maxLength={14} />
            </div>
          </div>

          <div style={S.confirmActions}>
            <button style={S.cancelBtn} onClick={onClose}>Cancel</button>
            <button style={S.applyBtn} onClick={() => { onComplete(fields); onClose(); }}>
              Apply Details →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Camera / Preview / Processing / Retry ─────────────────────────────────
  return (
    <div style={S.backdrop}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* ── Camera (always in DOM so refs stay attached) ── */}
      <div style={{ ...S.camWrap, display: phase === "camera" ? "flex" : "none" }}>
        <video ref={videoRef} style={S.video} playsInline muted autoPlay />
        <canvas ref={overlayRef} style={S.overlay} />
        <canvas ref={captureRef} style={{ display: "none" }} />

        <div style={S.topBar}>
          <div>
            <span style={S.phaseChip}>AADHAAR SCAN</span>
            <span style={S.phaseLabel}>Point the BACK of the Aadhaar card at the camera</span>
          </div>
          <button style={S.xBtn} onClick={() => { stopCamera(); onClose(); }}>✕</button>
        </div>

        {camError && <div style={S.errorBanner}>{camError}</div>}

        <div style={S.bottomBar}>
          <p style={S.bottomHint}>Align the full card · Good lighting · Hold steady</p>
          <button style={S.shutterBtn} onClick={capturePhoto} aria-label="Capture photo">
            <span style={S.shutterInner} />
          </button>
          <p style={{ ...S.bottomHint, fontSize: 11, opacity: 0.55 }}>Tap to capture</p>
        </div>
      </div>

      {/* ── Preview ── */}
      {phase === "preview" && capturedURL && (
        <div style={S.fullScreen}>
          <div style={S.screenTop}>
            <span style={S.screenTitle}>Check the photo</span>
            <button style={S.xBtn} onClick={() => { stopCamera(); onClose(); }}>✕</button>
          </div>
          <img src={capturedURL} alt="Captured card" style={S.capturedImg} />
          <div style={S.screenBottom}>
            <p style={S.hintWhite}>Is the full card visible? Is text and QR code sharp?</p>
            <div style={S.rowBtns}>
              <button style={S.retakeBtn} onClick={retake}>↩ Retake</button>
              <button style={S.primaryBtn} onClick={analysePhoto}>Analyse →</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Processing ── */}
      {phase === "processing" && (
        <div style={S.fullScreen}>
          {capturedURL && <img src={capturedURL} alt="" style={{ ...S.capturedImg, opacity: 0.25 }} />}
          <div style={S.centreBox}>
            <div style={S.spinner} />
            <span style={S.boxTitle}>Analysing image…</span>
            <span style={S.boxHint}>Checking quality · Reading QR code</span>
          </div>
        </div>
      )}

      {/* ── Retry ── */}
      {phase === "retry" && retryInfo && (
        <div style={S.fullScreen}>
          {capturedURL && <img src={capturedURL} alt="" style={{ ...S.capturedImg, opacity: 0.25 }} />}
          <div style={S.centreBox}>
            <div style={S.retryIcon}>✕</div>
            <span style={S.boxTitle}>{retryInfo.reason}</span>
            <span style={S.boxHint}>{retryInfo.suggestion}</span>
            <button style={{ ...S.primaryBtn, marginTop: 4 }} onClick={retake}>📷 Try Again</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  backdrop:     { position: "fixed", inset: 0, zIndex: 1000, background: "#000", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif" },

  // Camera
  camWrap:      { position: "relative", width: "100%", height: "100%", flexDirection: "column", overflow: "hidden" },
  video:        { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" },
  overlay:      { position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" },
  topBar:       { position: "absolute", top: 0, left: 0, right: 0, padding: "16px 20px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", background: "linear-gradient(to bottom,rgba(0,0,0,.78),transparent)" },
  phaseChip:    { display: "inline-block", fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" as const, color: "#fff", background: "rgba(255,255,255,.18)", borderRadius: 20, padding: "3px 10px", marginBottom: 4 },
  phaseLabel:   { display: "block", fontSize: 14, fontWeight: 600, color: "#fff" },
  xBtn:         { background: "rgba(0,0,0,.45)", border: "none", color: "#fff", width: 34, height: 34, borderRadius: "50%", fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  errorBanner:  { position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: "#FEF2F2", border: "1.5px solid #FCA5A5", borderRadius: 12, padding: "16px 24px", fontSize: 14, color: "#DC2626", textAlign: "center" as const, maxWidth: 300, zIndex: 2 },
  bottomBar:    { position: "absolute", bottom: 0, left: 0, right: 0, padding: "24px 24px 52px", background: "linear-gradient(to top,rgba(0,0,0,.82),transparent)", display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 14 },
  bottomHint:   { color: "rgba(255,255,255,.75)", fontSize: 13, textAlign: "center" as const, margin: 0 },
  shutterBtn:   { width: 78, height: 78, borderRadius: "50%", border: "4px solid rgba(255,255,255,.85)", background: "rgba(255,255,255,.15)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 },
  shutterInner: { display: "block", width: 60, height: 60, borderRadius: "50%", background: "#fff" },

  // Shared fullscreen
  fullScreen:   { position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  capturedImg:  { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" as const },

  // Preview overlays
  screenTop:    { position: "absolute", top: 0, left: 0, right: 0, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "linear-gradient(to bottom,rgba(0,0,0,.82),transparent)", zIndex: 2 },
  screenTitle:  { fontSize: 16, fontWeight: 700, color: "#fff" },
  screenBottom: { position: "absolute", bottom: 0, left: 0, right: 0, padding: "24px 24px 52px", background: "linear-gradient(to top,rgba(0,0,0,.9),transparent)", display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 16, zIndex: 2 },
  hintWhite:    { color: "rgba(255,255,255,.8)", fontSize: 13, textAlign: "center" as const, margin: 0 },
  rowBtns:      { display: "flex", gap: 12, width: "100%", maxWidth: 320 },
  retakeBtn:    { flex: 1, padding: "13px 0", border: "2px solid rgba(255,255,255,.65)", background: "rgba(255,255,255,.1)", color: "#fff", borderRadius: 40, fontSize: 14, fontWeight: 700, cursor: "pointer" },
  primaryBtn:   { flex: 1, padding: "13px 0", border: "none", background: "#fff", color: "#0C1929", borderRadius: 40, fontSize: 14, fontWeight: 700, cursor: "pointer" },

  // Centre box (processing / retry)
  centreBox:    { position: "relative", zIndex: 2, display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 14, padding: "32px 28px", background: "rgba(0,0,0,.75)", borderRadius: 20, maxWidth: 320, textAlign: "center" as const, margin: 16 },
  spinner:      { width: 44, height: 44, border: "3px solid rgba(255,255,255,.2)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  boxTitle:     { fontSize: 17, fontWeight: 700, color: "#fff" },
  boxHint:      { fontSize: 13, color: "rgba(255,255,255,.7)", lineHeight: 1.5 },
  retryIcon:    { width: 54, height: 54, borderRadius: "50%", background: "#DC2626", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: "#fff", fontWeight: 800, flexShrink: 0 },

  // Confirm card
  confirmCard:    { background: "#fff", borderRadius: 20, width: "100%", maxWidth: 580, maxHeight: "92vh", overflowY: "auto" as const, padding: "28px 32px", boxShadow: "0 24px 80px rgba(0,0,0,.35)", margin: 16 },
  confirmHeader:  { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  confirmTitle:   { fontSize: 18, fontWeight: 700, color: "#0C1929" },
  confirmSub:     { fontSize: 13, color: "#888", marginBottom: 20 },
  confirmGrid:    { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px", marginBottom: 24 },
  confirmActions: { display: "flex", justifyContent: "flex-end", gap: 12 },
  fLabel:         { fontSize: 10, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase" as const, color: "#666", display: "flex", alignItems: "center", gap: 8 },
  fInput:         { padding: "9px 12px", border: "1.5px solid #E2E0DC", borderRadius: 8, fontSize: 14, color: "#111", outline: "none", width: "100%", boxSizing: "border-box" as const },
  cancelBtn:      { padding: "10px 22px", border: "1.5px solid #E2E0DC", background: "none", borderRadius: 9, fontSize: 14, fontWeight: 600, color: "#666", cursor: "pointer" },
  applyBtn:       { padding: "10px 26px", background: "#0C1929", color: "#fff", border: "none", borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  verifiedBadge:  { fontSize: 11, fontWeight: 700, color: "#166534", background: "#DCFCE7", borderRadius: 20, padding: "2px 8px" },
  unverifiedBadge:{ fontSize: 11, fontWeight: 600, color: "#92400E", background: "#FEF3C7", borderRadius: 20, padding: "2px 8px" },
};
