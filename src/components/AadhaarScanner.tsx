"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { decodeAadhaarQR } from "@/lib/aadhaar/qr-decoder";
import { mapQRToForm, mergeOCRFields } from "@/lib/aadhaar/field-mapper";
import type { AadhaarFormFields } from "@/lib/aadhaar/field-mapper";

type Phase     = "qr" | "ocr-front" | "ocr-back" | "processing" | "confirm";
type Brightness = "low" | "ok" | "high";

interface Quality { brightness: Brightness; ready: boolean }

interface Props {
  onComplete: (fields: AadhaarFormFields) => void;
  onClose:    () => void;
}

// ── Card guide dimensions ─────────────────────────────────────────────────────
const CARD_RATIO   = 1.586; // ISO/IEC 7810 ID-1 landscape
const CARD_MARGIN  = 0.06;  // fraction of canvas width

function cardRect(w: number, h: number) {
  const cw = w * (1 - 2 * CARD_MARGIN);
  const ch = cw / CARD_RATIO;
  const cx = w * CARD_MARGIN;
  const cy = (h - ch) / 2;
  return { cx, cy, cw, ch };
}

// ── Overlay canvas: dark surround + corner markers ───────────────────────────
function drawOverlay(
  canvas:  HTMLCanvasElement,
  w:       number,
  h:       number,
  success: boolean,
  ready:   boolean,
) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);

  const { cx, cy, cw, ch } = cardRect(w, h);

  // Dark vignette outside card
  ctx.fillStyle = "rgba(0,0,0,0.58)";
  ctx.fillRect(0, 0, w, h);
  ctx.clearRect(cx, cy, cw, ch);

  // Corner markers
  const cl    = Math.min(cw, ch) * 0.13;
  const lw    = 3.5;
  const color = success || ready ? "#22C55E" : "#FFFFFF";

  ctx.strokeStyle = color;
  ctx.lineWidth   = lw;
  ctx.lineCap     = "round";

  const corners: [number, number, number, number, number, number][] = [
    [cx,      cy + cl, cx,      cy,      cx + cl, cy     ],  // TL
    [cx+cw-cl, cy,     cx+cw,   cy,      cx+cw,   cy+cl  ],  // TR
    [cx,      cy+ch-cl, cx,    cy+ch,    cx+cl,   cy+ch  ],  // BL
    [cx+cw-cl, cy+ch,  cx+cw,  cy+ch,   cx+cw,   cy+ch-cl], // BR
  ];
  for (const [x1,y1,x2,y2,x3,y3] of corners) {
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.lineTo(x3,y3); ctx.stroke();
  }
}

// ── Brightness check on the card region ──────────────────────────────────────
function checkBrightness(ctx: CanvasRenderingContext2D, w: number, h: number): Brightness {
  const { cx, cy, cw, ch } = cardRect(w, h);
  const img    = ctx.getImageData(cx, cy, cw, ch);
  const data   = img.data;
  let total    = 0;
  const step   = 40; // sample every 10th pixel for speed
  let count    = 0;
  for (let i = 0; i < data.length; i += step) {
    total += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    count++;
  }
  const avg = total / count;
  if (avg < 55)  return "low";
  if (avg > 215) return "high";
  return "ok";
}

const PHASE_LABELS: Record<Phase, string> = {
  "qr":         "Point the back of the Aadhaar card at the camera",
  "ocr-front":  "Show the FRONT of the Aadhaar card",
  "ocr-back":   "Flip the card — show the BACK now",
  "processing": "Reading card details…",
  "confirm":    "Review extracted details",
};

export default function AadhaarScanner({ onComplete, onClose }: Props) {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const captureRef = useRef<HTMLCanvasElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const rafRef     = useRef<number>(0);
  const stableRef  = useRef(0);   // consecutive "ready" frames
  const ocrFront   = useRef<Partial<AadhaarFormFields>>({});

  const [phase,       setPhase]       = useState<Phase>("qr");
  const [quality,     setQuality]     = useState<Quality>({ brightness: "ok", ready: false });
  const [qrFailed,    setQRFailed]    = useState(false);
  const [countdown,   setCountdown]   = useState<number | null>(null);
  const [fields,      setFields]      = useState<AadhaarFormFields>({});
  const [processing,  setProcessing]  = useState(false);
  const [camError,    setCamError]    = useState<string | null>(null);

  // ── Camera lifecycle ────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
    } catch {
      setCamError("Camera access denied. Please allow camera permission and try again.");
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  // ── QR scan loop ────────────────────────────────────────────────────────────
  const scanLoop = useCallback(() => {
    const video   = videoRef.current;
    const overlay = overlayRef.current;
    const capture = captureRef.current;
    if (!video || !overlay || !capture || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }

    const w = video.videoWidth;
    const h = video.videoHeight;
    overlay.width  = w;
    overlay.height = h;
    capture.width  = w;
    capture.height = h;

    const ctx = capture.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(video, 0, 0, w, h);

    // Draw overlay (no quality check in QR mode)
    drawOverlay(overlay, w, h, false, false);

    // QR scan with jsQR (loaded dynamically to keep initial bundle lean)
    import("jsqr").then(({ default: jsQR }) => {
      const img  = ctx.getImageData(0, 0, w, h);
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
      if (code?.data) {
        const decoded = decodeAadhaarQR(code.data);
        if (decoded) {
          stopCamera();
          drawOverlay(overlay, w, h, true, false);
          setFields(mapQRToForm(decoded));
          setPhase("confirm");
          return;
        }
      }
      rafRef.current = requestAnimationFrame(scanLoop);
    });
  }, [stopCamera]);

  // ── OCR quality + auto-capture loop ─────────────────────────────────────────
  const ocrLoop = useCallback((side: "front" | "back") => {
    const video   = videoRef.current;
    const overlay = overlayRef.current;
    const capture = captureRef.current;
    if (!video || !overlay || !capture || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(() => ocrLoop(side));
      return;
    }

    const w = video.videoWidth;
    const h = video.videoHeight;
    overlay.width  = w;
    overlay.height = h;
    capture.width  = w;
    capture.height = h;

    const ctx  = capture.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(video, 0, 0, w, h);

    const brightness = checkBrightness(ctx, w, h);
    const ready      = brightness === "ok";

    setQuality({ brightness, ready });

    if (ready) {
      stableRef.current++;
    } else {
      stableRef.current = 0;
    }

    // Auto-capture after 45 stable "good quality" frames (~1.5 s at 30 fps)
    if (stableRef.current >= 45) {
      stableRef.current = 0;
      captureFrame(side);
      return;
    }

    drawOverlay(overlay, w, h, false, ready);
    rafRef.current = requestAnimationFrame(() => ocrLoop(side));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Start the right scan loop when phase changes ─────────────────────────
  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    stableRef.current = 0;
    setQuality({ brightness: "ok", ready: false });
    setCountdown(null);

    if (phase === "qr") {
      rafRef.current = requestAnimationFrame(scanLoop);
    } else if (phase === "ocr-front") {
      rafRef.current = requestAnimationFrame(() => ocrLoop("front"));
    } else if (phase === "ocr-back") {
      rafRef.current = requestAnimationFrame(() => ocrLoop("back"));
    }
  }, [phase, scanLoop, ocrLoop]);

  // ── Capture a still frame and run OCR ────────────────────────────────────
  const captureFrame = useCallback(async (side: "front" | "back") => {
    cancelAnimationFrame(rafRef.current);
    setPhase("processing");
    setProcessing(true);

    try {
      const { runOCR } = await import("@/lib/aadhaar/ocr-processor");
      const extracted  = await runOCR(captureRef.current!, side);

      if (side === "front") {
        ocrFront.current = extracted;
        // Camera stays open for back capture
        await startCamera();
        setPhase("ocr-back");
      } else {
        const merged = mergeOCRFields(ocrFront.current, extracted);
        stopCamera();
        setFields(merged);
        setPhase("confirm");
      }
    } catch {
      setPhase(side === "front" ? "ocr-front" : "ocr-back");
    } finally {
      setProcessing(false);
    }
  }, [startCamera, stopCamera]);

  // ── Switch from QR fail → OCR path ───────────────────────────────────────
  const switchToOCR = useCallback(async () => {
    cancelAnimationFrame(rafRef.current);
    setQRFailed(true);
    // Camera may still be running, just switch phase
    setPhase("ocr-front");
  }, []);

  // ── Field edit helpers ────────────────────────────────────────────────────
  const setField = (k: keyof AadhaarFormFields) => (v: string) =>
    setFields(f => ({ ...f, [k]: v }));

  // ── Brightness badge ──────────────────────────────────────────────────────
  const brightnessLabel = quality.brightness === "low"  ? "Too Dark"
                        : quality.brightness === "high" ? "Too Bright"
                        : "Good";
  const brightnessColor = quality.brightness === "ok" ? "#22C55E" : "#F59E0B";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={S.backdrop}>
      {/* ── Confirm / review screen ── */}
      {phase === "confirm" ? (
        <div style={S.confirmCard}>
          <div style={S.confirmHeader}>
            <span style={S.confirmTitle}>Review Extracted Details</span>
            <button style={S.closeBtn} onClick={onClose}>✕</button>
          </div>
          <p style={S.confirmSub}>
            {qrFailed ? "OCR results — please verify carefully." : "QR decoded successfully — confirm and apply."}
          </p>

          <div style={S.confirmGrid}>
            {(
              [
                ["Full Name",    "name",        "text"],
                ["Date of Birth","dateOfBirth",  "date"],
                ["Gender",       "gender",       "select"],
                ["Address",      "address",      "text"],
                ["City / VTC",   "city",         "text"],
                ["State",        "state",        "text"],
                ["Pincode",      "pincode",      "text"],
              ] as [string, keyof AadhaarFormFields, string][]
            ).map(([label, key, type]) => (
              <div key={key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={S.fLabel}>{label}</label>
                {type === "select" ? (
                  <select style={S.fInput} value={fields[key] ?? ""} onChange={e => setField(key)(e.target.value)}>
                    <option value="">Select</option>
                    <option>Male</option><option>Female</option><option>Other</option>
                  </select>
                ) : (
                  <input
                    style={S.fInput}
                    type={type}
                    value={fields[key] ?? ""}
                    onChange={e => setField(key)(e.target.value)}
                    placeholder={label}
                  />
                )}
              </div>
            ))}
          </div>

          <div style={S.confirmActions}>
            <button style={S.cancelBtn} onClick={onClose}>Cancel</button>
            <button style={S.applyBtn}  onClick={() => { onComplete(fields); onClose(); }}>
              Apply Details →
            </button>
          </div>
        </div>
      ) : (
        /* ── Camera screen ── */
        <div style={S.camWrap}>
          {/* Video feed */}
          <video ref={videoRef} style={S.video} playsInline muted autoPlay />

          {/* Overlay canvas (guide rect + vignette) */}
          <canvas ref={overlayRef} style={S.overlay} />

          {/* Hidden canvas used for frame capture + QR analysis */}
          <canvas ref={captureRef} style={{ display: "none" }} />

          {/* Top bar */}
          <div style={S.topBar}>
            <div>
              <span style={S.phaseChip}>
                {phase === "ocr-front" ? "Step 2a of 3" : phase === "ocr-back" ? "Step 2b of 3" : "Step 1 of 3"}
              </span>
              <span style={S.phaseLabel}>{PHASE_LABELS[phase]}</span>
            </div>
            <button style={S.closeBtn} onClick={() => { stopCamera(); onClose(); }}>✕</button>
          </div>

          {/* Camera error */}
          {camError && (
            <div style={S.errorBanner}>{camError}</div>
          )}

          {/* OCR quality badge (only in OCR phases) */}
          {(phase === "ocr-front" || phase === "ocr-back") && !processing && (
            <div style={S.qualityBar}>
              <span style={{ ...S.qualityPill, background: brightnessColor }}>
                💡 Lighting: {brightnessLabel}
              </span>
              {quality.ready && (
                <span style={{ ...S.qualityPill, background: "#22C55E" }}>
                  ✓ Hold steady…
                </span>
              )}
            </div>
          )}

          {/* Processing indicator */}
          {processing && (
            <div style={S.processingBanner}>⏳ Reading card details…</div>
          )}

          {/* Bottom bar */}
          <div style={S.bottomBar}>
            {phase === "qr" && (
              <>
                <p style={S.bottomHint}>Scanning for QR code on the back of the card…</p>
                <button style={S.fallbackBtn} onClick={switchToOCR}>
                  QR damaged or unreadable? Switch to manual scan →
                </button>
              </>
            )}

            {(phase === "ocr-front" || phase === "ocr-back") && !processing && (
              <>
                <p style={S.bottomHint}>
                  {phase === "ocr-front"
                    ? "Align the front of the card within the frame."
                    : "Flip the card and align the back within the frame."}
                </p>
                <button
                  style={{ ...S.captureBtn, opacity: quality.ready ? 1 : 0.5 }}
                  onClick={() => captureFrame(phase === "ocr-front" ? "front" : "back")}
                >
                  📷 Capture
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  backdrop:    { position: "fixed", inset: 0, zIndex: 1000, background: "#000", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif" },
  camWrap:     { position: "relative", width: "100%", height: "100%", overflow: "hidden" },
  video:       { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" },
  overlay:     { position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" },

  topBar:      { position: "absolute", top: 0, left: 0, right: 0, padding: "16px 20px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", background: "linear-gradient(to bottom, rgba(0,0,0,.75), transparent)" },
  phaseChip:   { display: "inline-block", fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" as const, color: "#fff", background: "rgba(255,255,255,.18)", borderRadius: 20, padding: "3px 10px", marginBottom: 4 },
  phaseLabel:  { display: "block", fontSize: 14, fontWeight: 600, color: "#fff" },
  closeBtn:    { background: "rgba(0,0,0,.45)", border: "none", color: "#fff", width: 34, height: 34, borderRadius: "50%", fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },

  errorBanner:     { position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: "#FEF2F2", border: "1.5px solid #FCA5A5", borderRadius: 12, padding: "16px 24px", fontSize: 14, color: "#DC2626", textAlign: "center" as const, maxWidth: 320 },
  processingBanner:{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: "rgba(0,0,0,.72)", color: "#fff", borderRadius: 12, padding: "14px 24px", fontSize: 14, fontWeight: 600 },

  qualityBar:  { position: "absolute", bottom: 130, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 10 },
  qualityPill: { color: "#fff", fontSize: 12, fontWeight: 600, borderRadius: 20, padding: "5px 14px" },

  bottomBar:   { position: "absolute", bottom: 0, left: 0, right: 0, padding: "20px 24px 36px", background: "linear-gradient(to top, rgba(0,0,0,.78), transparent)", display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 12 },
  bottomHint:  { color: "rgba(255,255,255,.8)", fontSize: 13, textAlign: "center" as const, margin: 0 },
  captureBtn:  { background: "#fff", color: "#0C1929", border: "none", borderRadius: 40, padding: "13px 36px", fontSize: 15, fontWeight: 700, cursor: "pointer", transition: "opacity .2s" },
  fallbackBtn: { background: "none", border: "none", color: "rgba(255,255,255,.6)", fontSize: 12, cursor: "pointer", textDecoration: "underline" },

  // Confirm card
  confirmCard:    { background: "#fff", borderRadius: 20, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto" as const, padding: "28px 32px", boxShadow: "0 24px 80px rgba(0,0,0,.35)" },
  confirmHeader:  { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  confirmTitle:   { fontSize: 18, fontWeight: 700, color: "#0C1929" },
  confirmSub:     { fontSize: 13, color: "#888", marginBottom: 20 },
  confirmGrid:    { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px", marginBottom: 24 },
  confirmActions: { display: "flex", justifyContent: "flex-end", gap: 12 },
  fLabel:         { fontSize: 10, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase" as const, color: "#666" },
  fInput:         { padding: "9px 12px", border: "1.5px solid #E2E0DC", borderRadius: 8, fontSize: 14, color: "#111", outline: "none", width: "100%", boxSizing: "border-box" as const },
  cancelBtn:      { padding: "10px 22px", border: "1.5px solid #E2E0DC", background: "none", borderRadius: 9, fontSize: 14, fontWeight: 600, color: "#666", cursor: "pointer" },
  applyBtn:       { padding: "10px 26px", background: "#0C1929", color: "#fff", border: "none", borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: "pointer" },
};
