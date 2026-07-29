"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { decodeAadhaarQR }              from "@/lib/aadhaar/qr-decoder";
import { mapQRToForm, mergeOCRFields }  from "@/lib/aadhaar/field-mapper";
import type { AadhaarFormFields }       from "@/lib/aadhaar/field-mapper";
import { assessFrameQuality }           from "@/lib/aadhaar/ocr-processor";
import type { FrameQuality }            from "@/lib/aadhaar/ocr-processor";

type Phase = "qr" | "ocr-front" | "ocr-back" | "processing" | "confirm";

interface Props {
  onComplete: (fields: AadhaarFormFields) => void;
  onClose:    () => void;
}

// ── Card guide (ISO/IEC 7810 ID-1 landscape) ─────────────────────────────────
const CARD_RATIO  = 1.586;
const CARD_MARGIN = 0.06;

function cardRect(w: number, h: number) {
  const cw = w * (1 - 2 * CARD_MARGIN);
  const ch = cw / CARD_RATIO;
  const cx = w * CARD_MARGIN;
  const cy = (h - ch) / 2;
  return { cx, cy, cw, ch };
}

// ── Overlay canvas ─────────────────────────────────────────────────────────────
type OverlayMood = "neutral" | "warn" | "ready" | "success";

function drawOverlay(
  canvas: HTMLCanvasElement,
  w: number, h: number,
  mood: OverlayMood,
) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  const { cx, cy, cw, ch } = cardRect(w, h);

  // Dark vignette outside card
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, w, h);
  ctx.clearRect(cx, cy, cw, ch);

  const cl    = Math.min(cw, ch) * 0.13;
  const lw    = 3.5;
  const color = mood === "success" ? "#22C55E"
              : mood === "ready"   ? "#86EFAC"
              : mood === "warn"    ? "#F59E0B"
              : "#FFFFFF";

  ctx.strokeStyle = color;
  ctx.lineWidth   = lw;
  ctx.lineCap     = "round";

  const corners: [number, number, number, number, number, number][] = [
    [cx,        cy + cl,  cx,       cy,       cx + cl,  cy      ],
    [cx+cw-cl,  cy,       cx+cw,    cy,       cx+cw,    cy+cl   ],
    [cx,        cy+ch-cl, cx,       cy+ch,    cx+cl,    cy+ch   ],
    [cx+cw-cl,  cy+ch,    cx+cw,    cy+ch,    cx+cw,    cy+ch-cl],
  ];
  for (const [x1,y1,x2,y2,x3,y3] of corners) {
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.lineTo(x3,y3); ctx.stroke();
  }
}

// ── Display quality state (extends FrameQuality with UI message) ──────────────
interface DisplayQuality extends FrameQuality {
  statusMsg: string; // context-aware message shown to user
}

const INIT_QUALITY: DisplayQuality = {
  brightness: "ok", blur: "ok", ready: false,
  level: "warn", message: "", statusMsg: "Starting camera…",
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function AadhaarScanner({ onComplete, onClose }: Props) {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const captureRef = useRef<HTMLCanvasElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const rafRef     = useRef<number>(0);
  const stableRef  = useRef(0);
  const ocrFront   = useRef<Partial<AadhaarFormFields>>({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zxingRef    = useRef<((d: ImageData) => Promise<{ text: string }[]>) | null>(null);
  const killedRef   = useRef(false);  // stop zombie RAF callbacks
  const scanningRef = useRef(false);  // prevent concurrent ZXing calls

  const [phase,           setPhase]          = useState<Phase>("qr");
  const [quality,         setQuality]        = useState<DisplayQuality>(INIT_QUALITY);
  const [fields,          setFields]         = useState<AadhaarFormFields>({});
  const [processing,      setProcessing]     = useState(false);
  const [camError,        setCamError]       = useState<string | null>(null);
  const [qrFailed,        setQRFailed]       = useState(false);
  const [aadhaarVerified, setAadhaarVerified] = useState<boolean | null>(null);

  // ── Camera lifecycle ─────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    killedRef.current  = false;
    scanningRef.current = false;
    setCamError(null);
    stableRef.current = 0;
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

  // ── Shared: draw frame + compute quality ────────────────────────────────────
  function drawFrame(): { w: number; h: number; ctx: CanvasRenderingContext2D; rect: ReturnType<typeof cardRect> } | null {
    const video   = videoRef.current;
    const overlay = overlayRef.current;
    const capture = captureRef.current;
    if (!video || !overlay || !capture || video.readyState < 2) return null;

    const w = video.videoWidth, h = video.videoHeight;
    overlay.width = capture.width  = w;
    overlay.height = capture.height = h;

    const ctx = capture.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(video, 0, 0, w, h);
    return { w, h, ctx, rect: cardRect(w, h) };
  }

  // ── QR scan loop ─────────────────────────────────────────────────────────────
  const scanLoop = useCallback(() => {
    if (killedRef.current) return;

    const frame = drawFrame();
    if (!frame) { rafRef.current = requestAnimationFrame(scanLoop); return; }
    const { w, h, ctx, rect: { cx, cy, cw, ch } } = frame;

    // Quality check every frame — drives corner color + status message
    const q = assessFrameQuality(ctx, cx, cy, cw, ch);
    const mood: OverlayMood = q.level === "good" ? "ready" : q.level === "warn" ? "warn" : "neutral";
    drawOverlay(overlayRef.current!, w, h, mood);
    setQuality({ ...q, statusMsg: q.ready ? "Scanning for QR code…" : q.message });

    // Gate ZXing: only run when quality is ok and no decode in flight
    if (!q.ready || scanningRef.current) {
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }

    scanningRef.current = true;
    const imgData = ctx.getImageData(0, 0, w, h);

    (async () => {
      try {
        if (!zxingRef.current) {
          const { readBarcodesFromImageData } = await import("zxing-wasm/reader");
          zxingRef.current = (d: ImageData) =>
            readBarcodesFromImageData(d, { formats: ["QRCode"], tryHarder: true });
        }
        const results = await zxingRef.current(imgData);
        const text    = results[0]?.text;

        if (text && !killedRef.current) {
          const decoded = decodeAadhaarQR(text);
          if (decoded && !killedRef.current) {
            killedRef.current = true;
            stopCamera();
            drawOverlay(overlayRef.current!, w, h, "success");
            setPhase("processing");
            setProcessing(true);

            try {
              const { ocrAadhaarNumber } = await import("@/lib/aadhaar/ocr-processor");
              const aaRes = await ocrAadhaarNumber(captureRef.current!, { cx, cy, cw, ch });
              setAadhaarVerified(aaRes.verified);
              setFields({ ...mapQRToForm(decoded), aadhaarNumber: aaRes.number ?? undefined });
            } catch {
              setFields(mapQRToForm(decoded));
            } finally {
              setProcessing(false);
              setPhase("confirm");
            }
            return;
          }
        }
      } finally {
        if (!killedRef.current) scanningRef.current = false;
      }
      if (!killedRef.current) rafRef.current = requestAnimationFrame(scanLoop);
    })();
  }, [stopCamera]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── OCR quality + auto-capture loop ─────────────────────────────────────────
  const ocrLoop = useCallback((side: "front" | "back") => {
    if (killedRef.current) return;

    const frame = drawFrame();
    if (!frame) { rafRef.current = requestAnimationFrame(() => ocrLoop(side)); return; }
    const { w, h, ctx, rect: { cx, cy, cw, ch } } = frame;

    const q = assessFrameQuality(ctx, cx, cy, cw, ch);

    if (q.ready) {
      stableRef.current++;
    } else {
      stableRef.current = 0;
    }

    const stable = stableRef.current;

    // Build countdown message when quality is good
    let statusMsg = q.message;
    if (q.ready) {
      if (stable >= 38)      statusMsg = "Capturing…";
      else if (stable >= 15) statusMsg = `Hold steady — capturing in ${Math.ceil((45 - stable) / 30)}s`;
      else                   statusMsg = "Good — hold steady…";
    }

    const mood: OverlayMood = q.level === "good" && stable > 5 ? "ready"
                            : q.level === "warn"                ? "warn"
                            : "neutral";
    drawOverlay(overlayRef.current!, w, h, mood);
    setQuality({ ...q, statusMsg });

    if (stable >= 45) {
      stableRef.current = 0;
      captureFrame(side);
      return;
    }

    rafRef.current = requestAnimationFrame(() => ocrLoop(side));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Start right loop when phase changes ─────────────────────────────────────
  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    stableRef.current = 0;
    setQuality(INIT_QUALITY);

    if (phase === "qr") {
      killedRef.current = false;
      scanningRef.current = false;
      rafRef.current = requestAnimationFrame(scanLoop);
    } else if (phase === "ocr-front") {
      rafRef.current = requestAnimationFrame(() => ocrLoop("front"));
    } else if (phase === "ocr-back") {
      rafRef.current = requestAnimationFrame(() => ocrLoop("back"));
    }
  }, [phase, scanLoop, ocrLoop]);

  // ── Capture frame → run OCR ───────────────────────────────────────────────
  const captureFrame = useCallback(async (side: "front" | "back") => {
    cancelAnimationFrame(rafRef.current);
    setPhase("processing");
    setProcessing(true);

    try {
      const { runOCR } = await import("@/lib/aadhaar/ocr-processor");
      const extracted  = await runOCR(captureRef.current!, side);

      if (side === "front") {
        ocrFront.current = extracted;
        await startCamera();
        setPhase("ocr-back");
      } else {
        const merged = mergeOCRFields(ocrFront.current, extracted);
        stopCamera();
        setFields(merged);
        setAadhaarVerified(merged.aadhaarNumber ? null : null); // needs manual check
        setPhase("confirm");
      }
    } catch {
      setPhase(side === "front" ? "ocr-front" : "ocr-back");
    } finally {
      setProcessing(false);
    }
  }, [startCamera, stopCamera]);

  // ── Switch to OCR fallback ───────────────────────────────────────────────
  const switchToOCR = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    killedRef.current = true; // kill qr scan loop
    setQRFailed(true);
    setPhase("ocr-front");
  }, []);

  const setField = (k: keyof AadhaarFormFields) => (v: string) =>
    setFields(f => ({ ...f, [k]: v }));

  // ── Render ─────────────────────────────────────────────────────────────────
  const isOCRPhase = phase === "ocr-front" || phase === "ocr-back";

  return (
    <div style={S.backdrop}>
      {/* ── Confirm screen ── */}
      {phase === "confirm" ? (
        <div style={S.confirmCard}>
          <div style={S.confirmHeader}>
            <span style={S.confirmTitle}>Review Extracted Details</span>
            <button style={S.closeBtn} onClick={onClose}>✕</button>
          </div>
          <p style={S.confirmSub}>
            {qrFailed
              ? "OCR results — verify carefully before applying."
              : "QR decoded — confirm details and apply."}
          </p>

          <div style={S.confirmGrid}>
            {(
              [
                ["Full Name",    "name",         "text"],
                ["Date of Birth","dateOfBirth",   "date"],
                ["Gender",       "gender",        "select"],
                ["Address",      "address",       "text"],
                ["City / VTC",   "city",          "text"],
                ["State",        "state",         "text"],
                ["Pincode",      "pincode",       "text"],
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
                  <input style={S.fInput} type={type} value={fields[key] ?? ""}
                    onChange={e => setField(key)(e.target.value)} placeholder={label} />
                )}
              </div>
            ))}

            {/* Aadhaar number — full width with verification badge */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
              <label style={S.fLabel}>
                Aadhaar Number
                {aadhaarVerified === true  && <span style={S.verifiedBadge}>✓ Verified</span>}
                {aadhaarVerified === false && <span style={S.unverifiedBadge}>⚠ Unverified — check manually</span>}
              </label>
              <input
                style={S.fInput}
                type="text"
                value={fields.aadhaarNumber ?? ""}
                onChange={e => setField("aadhaarNumber")(e.target.value)}
                placeholder="xxxx xxxx xxxx"
                maxLength={14}
              />
            </div>
          </div>

          <div style={S.confirmActions}>
            <button style={S.cancelBtn} onClick={onClose}>Cancel</button>
            <button style={S.applyBtn} onClick={() => { onComplete(fields); onClose(); }}>
              Apply Details →
            </button>
          </div>
        </div>
      ) : (
        /* ── Camera screen ── */
        <div style={S.camWrap}>
          <video ref={videoRef} style={S.video} playsInline muted autoPlay />
          <canvas ref={overlayRef} style={S.overlay} />
          <canvas ref={captureRef} style={{ display: "none" }} />

          {/* Top bar */}
          <div style={S.topBar}>
            <div>
              <span style={S.phaseChip}>
                {phase === "ocr-front" ? "STEP 2a OF 3"
                  : phase === "ocr-back" ? "STEP 2b OF 3"
                  : "STEP 1 OF 3"}
              </span>
              <span style={S.phaseLabel}>
                {phase === "ocr-front" ? "Show the FRONT of the Aadhaar card"
                  : phase === "ocr-back" ? "Flip the card — show the BACK now"
                  : phase === "processing" ? "Reading card details…"
                  : "Point the back of the Aadhaar card at the camera"}
              </span>
            </div>
            <button style={S.closeBtn} onClick={() => { stopCamera(); onClose(); }}>✕</button>
          </div>

          {/* Camera error */}
          {camError && <div style={S.errorBanner}>{camError}</div>}

          {/* Processing overlay */}
          {processing && (
            <div style={S.processingBanner}>
              <div style={S.spinner} />
              Reading card details…
            </div>
          )}

          {/* ── Quality bar — shown in ALL camera phases ── */}
          {!processing && !camError && (
            <div style={S.qualityBar}>

              {/* OCR phase: two pill indicators + status */}
              {isOCRPhase ? (
                <div style={S.qualityPanel}>
                  <div style={S.qualityPills}>
                    <span style={{
                      ...S.qualityPill,
                      background: quality.brightness === "ok" ? "#166534" : quality.brightness === "high" ? "#92400E" : "#991B1B",
                      border:     `1px solid ${quality.brightness === "ok" ? "#22C55E" : quality.brightness === "high" ? "#F59E0B" : "#EF4444"}`,
                    }}>
                      <span style={pillDot(quality.brightness === "ok" ? "#22C55E" : "#EF4444")} />
                      💡 {quality.brightness === "ok" ? "Light OK" : quality.brightness === "low" ? "Too Dark" : "Too Bright"}
                    </span>
                    <span style={{
                      ...S.qualityPill,
                      background: quality.blur === "ok" ? "#166534" : "#92400E",
                      border:     `1px solid ${quality.blur === "ok" ? "#22C55E" : "#F59E0B"}`,
                    }}>
                      <span style={pillDot(quality.blur === "ok" ? "#22C55E" : "#F59E0B")} />
                      🔍 {quality.blur === "ok" ? "Sharp" : "Blurry"}
                    </span>
                  </div>
                  <p style={{
                    ...S.statusMsg,
                    color: quality.level === "good" ? "#86EFAC" : quality.level === "warn" ? "#FCD34D" : "#FCA5A5",
                  }}>
                    {quality.statusMsg}
                  </p>
                </div>
              ) : (
                /* QR phase: single status line */
                <div style={S.qrStatus}>
                  <span style={{ ...S.qrDot, background: quality.level === "good" ? "#22C55E" : quality.level === "warn" ? "#F59E0B" : "#EF4444" }} />
                  <span style={{ color: quality.level === "good" ? "#86EFAC" : quality.level === "warn" ? "#FCD34D" : "#FCA5A5", fontSize: 13 }}>
                    {quality.statusMsg || "Initializing…"}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Bottom bar */}
          <div style={S.bottomBar}>
            {phase === "qr" && !processing && (
              <>
                <p style={S.bottomHint}>Align the back of the card in the frame — QR auto-detects</p>
                <button style={S.fallbackBtn} onClick={switchToOCR}>
                  QR damaged or unreadable? Switch to manual scan →
                </button>
              </>
            )}

            {isOCRPhase && !processing && (
              <>
                <p style={S.bottomHint}>
                  {phase === "ocr-front"
                    ? "Align the FRONT of the card — name, DOB and gender will be captured"
                    : "Align the BACK — address, pincode and Aadhaar number will be captured"}
                </p>
                <button
                  style={{ ...S.captureBtn, opacity: quality.ready ? 1 : 0.45 }}
                  onClick={() => captureFrame(phase === "ocr-front" ? "front" : "back")}
                >
                  📷 Capture Now
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
function pillDot(color: string): React.CSSProperties {
  return { display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: color, marginRight: 5, flexShrink: 0 };
}

const S: Record<string, React.CSSProperties> = {
  backdrop:    { position: "fixed", inset: 0, zIndex: 1000, background: "#000", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif" },
  camWrap:     { position: "relative", width: "100%", height: "100%", overflow: "hidden" },
  video:       { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" },
  overlay:     { position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" },

  topBar:      { position: "absolute", top: 0, left: 0, right: 0, padding: "16px 20px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", background: "linear-gradient(to bottom, rgba(0,0,0,.78), transparent)" },
  phaseChip:   { display: "inline-block", fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" as const, color: "#fff", background: "rgba(255,255,255,.18)", borderRadius: 20, padding: "3px 10px", marginBottom: 4 },
  phaseLabel:  { display: "block", fontSize: 14, fontWeight: 600, color: "#fff" },
  closeBtn:    { background: "rgba(0,0,0,.45)", border: "none", color: "#fff", width: 34, height: 34, borderRadius: "50%", fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },

  errorBanner:      { position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: "#FEF2F2", border: "1.5px solid #FCA5A5", borderRadius: 12, padding: "16px 24px", fontSize: 14, color: "#DC2626", textAlign: "center" as const, maxWidth: 320 },
  processingBanner: { position: "absolute", inset: 0, display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: 16, background: "rgba(0,0,0,.72)", color: "#fff", fontSize: 15, fontWeight: 600 },
  spinner:          { width: 36, height: 36, border: "3px solid rgba(255,255,255,.2)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" },

  // Quality bar (sits above bottom bar)
  qualityBar:   { position: "absolute", bottom: 140, left: 0, right: 0, display: "flex", justifyContent: "center", padding: "0 20px" },

  // OCR phase quality panel
  qualityPanel: { background: "rgba(0,0,0,.65)", borderRadius: 14, padding: "12px 18px", display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 8, minWidth: 260 },
  qualityPills: { display: "flex", gap: 10 },
  qualityPill:  { display: "flex", alignItems: "center", fontSize: 12, fontWeight: 600, color: "#fff", borderRadius: 20, padding: "5px 12px" },
  statusMsg:    { fontSize: 13, fontWeight: 600, margin: 0, textAlign: "center" as const },

  // QR phase status
  qrStatus:     { background: "rgba(0,0,0,.55)", borderRadius: 20, padding: "7px 16px", display: "flex", alignItems: "center", gap: 8 },
  qrDot:        { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },

  bottomBar:    { position: "absolute", bottom: 0, left: 0, right: 0, padding: "20px 24px 36px", background: "linear-gradient(to top, rgba(0,0,0,.8), transparent)", display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 12 },
  bottomHint:   { color: "rgba(255,255,255,.75)", fontSize: 13, textAlign: "center" as const, margin: 0 },
  captureBtn:   { background: "#fff", color: "#0C1929", border: "none", borderRadius: 40, padding: "13px 40px", fontSize: 15, fontWeight: 700, cursor: "pointer", transition: "opacity .2s" },
  fallbackBtn:  { background: "none", border: "none", color: "rgba(255,255,255,.55)", fontSize: 12, cursor: "pointer", textDecoration: "underline" },

  // Confirm card
  confirmCard:    { background: "#fff", borderRadius: 20, width: "100%", maxWidth: 580, maxHeight: "92vh", overflowY: "auto" as const, padding: "28px 32px", boxShadow: "0 24px 80px rgba(0,0,0,.35)" },
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
