"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { decodeAadhaarQR }   from "@/lib/aadhaar/qr-decoder";
import { mapQRToForm }       from "@/lib/aadhaar/field-mapper";
import type { AadhaarFormFields } from "@/lib/aadhaar/field-mapper";

type Phase =
  | "camera_qr"     // Step 1 — square QR guide
  | "preview_qr"    // Preview QR close-up
  | "processing_qr" // Decoding QR
  | "camera_num"    // Step 2 — full-card guide
  | "preview_num"   // Preview full card
  | "processing_num"// OCR for number
  | "confirm"
  | "retry";

interface RetryInfo {
  reason:      string;
  suggestion:  string;
  retryPhase:  "camera_qr" | "camera_num";
}
interface Props { onComplete: (fields: AadhaarFormFields) => void; onClose: () => void; }

// ── Step-1 guide: large square for QR close-up ───────────────────────────────
function qrRect(w: number, h: number) {
  const s = Math.min(w, h) * 0.82;
  return { qx: (w - s) / 2, qy: (h - s) / 2, qs: s };
}

// ── Step-2 guide: full landscape card (ISO/IEC 7810 ID-1) ────────────────────
const CARD_RATIO  = 1.586;
const CARD_MARGIN = 0.06;
function cardRect(w: number, h: number) {
  let cw = w * (1 - 2 * CARD_MARGIN);
  let ch = cw / CARD_RATIO;
  if (ch > h * 0.82) { ch = h * 0.82; cw = ch * CARD_RATIO; }
  return { cx: (w - cw) / 2, cy: (h - ch) / 2, cw, ch };
}

function drawGuide(canvas: HTMLCanvasElement, w: number, h: number, mode: "qr" | "card") {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, w, h);

  let rx: number, ry: number, rw: number, rh: number;
  if (mode === "qr") {
    const { qx, qy, qs } = qrRect(w, h);
    rx = qx; ry = qy; rw = qs; rh = qs;
  } else {
    const { cx, cy, cw, ch } = cardRect(w, h);
    rx = cx; ry = cy; rw = cw; rh = ch;
  }
  ctx.clearRect(rx, ry, rw, rh);

  const cl = Math.min(rw, rh) * 0.13;
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth   = 3.5;
  ctx.lineCap     = "round";
  for (const [x1, y1, x2, y2, x3, y3] of [
    [rx,       ry + cl,   rx,    ry,    rx + cl,    ry    ],
    [rx+rw-cl, ry,        rx+rw, ry,    rx+rw,      ry+cl ],
    [rx,       ry+rh-cl,  rx,    ry+rh, rx+cl,      ry+rh ],
    [rx+rw-cl, ry+rh,     rx+rw, ry+rh, rx+rw,      ry+rh-cl],
  ] as [number, number, number, number, number, number][]) {
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.lineTo(x3,y3); ctx.stroke();
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AadhaarScanner({ onComplete, onClose }: Props) {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const captureRef = useRef<HTMLCanvasElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);

  const [phase,           setPhase]          = useState<Phase>("camera_qr");
  const [fields,          setFields]         = useState<AadhaarFormFields>({});
  const [qrFields,        setQrFields]       = useState<AadhaarFormFields>({});
  const [aadhaarVerified, setAadhaarVerified] = useState<boolean | null>(null);
  const [camError,        setCamError]       = useState<string | null>(null);
  const [qrPreviewURL,    setQrPreviewURL]   = useState<string | null>(null);
  const [numPreviewURL,   setNumPreviewURL]  = useState<string | null>(null);
  const [retryInfo,       setRetryInfo]      = useState<RetryInfo | null>(null);
  const [debugLog,        setDebugLog]       = useState<string[]>([]);

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

  // Preload WeChat WASM + CNN models while user aims camera
  useEffect(() => {
    import("qr-scanner-wechat").then(({ ready }) => ready()).catch(() => {});
  }, []);

  // ── Guide draw loop ───────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "camera_qr" && phase !== "camera_num") return;
    const mode: "qr" | "card" = phase === "camera_qr" ? "qr" : "card";
    let raf: number;
    const loop = () => {
      const v = videoRef.current, o = overlayRef.current;
      if (v && o && v.readyState >= 2 && v.videoWidth) {
        o.width = v.videoWidth; o.height = v.videoHeight;
        drawGuide(o, v.videoWidth, v.videoHeight, mode);
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

    if (phase === "camera_qr") {
      const { qx, qy, qs } = qrRect(c.width, c.height);
      const crop = document.createElement("canvas");
      crop.width = Math.round(qs); crop.height = Math.round(qs);
      crop.getContext("2d")!.drawImage(c, Math.round(qx), Math.round(qy), Math.round(qs), Math.round(qs), 0, 0, crop.width, crop.height);
      setQrPreviewURL(crop.toDataURL("image/jpeg", 0.92));
      setPhase("preview_qr");
    } else {
      const { cx, cy, cw, ch } = cardRect(c.width, c.height);
      const crop = document.createElement("canvas");
      crop.width = Math.round(cw); crop.height = Math.round(ch);
      crop.getContext("2d")!.drawImage(c, Math.round(cx), Math.round(cy), Math.round(cw), Math.round(ch), 0, 0, crop.width, crop.height);
      setNumPreviewURL(crop.toDataURL("image/jpeg", 0.92));
      setPhase("preview_num");
    }
  }, [phase, stopCamera]);

  // ── Step 1: Decode QR ─────────────────────────────────────────────────────
  const analyseQR = useCallback(async () => {
    setPhase("processing_qr");
    setDebugLog([]);
    const logs: string[] = [];
    const log = (msg: string) => { console.log("[Aadhaar]", msg); logs.push(msg); };

    const c = captureRef.current;
    if (!c) {
      setRetryInfo({ reason: "Internal error", suggestion: "Close and reopen the scanner.", retryPhase: "camera_qr" });
      setPhase("retry"); return;
    }

    log(`Canvas ${c.width}×${c.height}`);
    const { qx, qy, qs } = qrRect(c.width, c.height);
    log(`QR square x=${Math.round(qx)} y=${Math.round(qy)} s=${Math.round(qs)}`);

    const { assessFrameQuality } = await import("@/lib/aadhaar/ocr-processor");
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    const q = assessFrameQuality(ctx, qx, qy, qs, qs);
    log(`Quality bright=${q.brightness} blur=${q.blur} ready=${q.ready}`);

    if (!q.ready) {
      setDebugLog([...logs]);
      setRetryInfo({
        reason: q.brightness === "low" ? "Image too dark" : q.brightness === "high" ? "Too much glare" : "Image is blurry",
        suggestion: q.brightness === "low"
          ? "Move to a brighter area."
          : q.brightness === "high"
          ? "Tilt the phone slightly to reduce glare."
          : "Hold still and wait for the camera to focus.",
        retryPhase: "camera_qr",
      });
      setPhase("retry"); return;
    }

    try {
      log("Loading qr-scanner-wechat…");
      const { scan, ready } = await import("qr-scanner-wechat");
      await ready();
      log("Models ready");

      // A1: QR square region (at 6+ px/module should decode directly)
      const qrCanvas = document.createElement("canvas");
      qrCanvas.width = Math.round(qs); qrCanvas.height = Math.round(qs);
      qrCanvas.getContext("2d")!.drawImage(c, Math.round(qx), Math.round(qy), Math.round(qs), Math.round(qs), 0, 0, qrCanvas.width, qrCanvas.height);
      log(`A1 QR square ${qrCanvas.width}×${qrCanvas.height}`);
      let result = await scan(qrCanvas);
      log(`A1: ${result.text ? `len=${result.text.length}` : "null"}`);

      // A2: full frame
      if (!result.text) {
        log(`A2 full ${c.width}×${c.height}`);
        result = await scan(c);
        log(`A2: ${result.text ? `len=${result.text.length}` : "null"}`);
      }

      // A3: QR square ×2 (nearest-neighbour)
      if (!result.text) {
        const qr2x = document.createElement("canvas");
        qr2x.width = Math.round(qs) * 2; qr2x.height = Math.round(qs) * 2;
        const q2ctx = qr2x.getContext("2d")!;
        q2ctx.imageSmoothingEnabled = false;
        q2ctx.drawImage(c, Math.round(qx), Math.round(qy), Math.round(qs), Math.round(qs), 0, 0, qr2x.width, qr2x.height);
        log(`A3 QR×2 ${qr2x.width}×${qr2x.height}`);
        result = await scan(qr2x);
        log(`A3: ${result.text ? `len=${result.text.length}` : "null"}`);
      }

      const text = result.text ?? "";
      if (text) {
        log(`textLen=${text.length} allDigits=${/^\d+$/.test(text)}`);
        const decoded = decodeAadhaarQR(text);
        log(`decode=${decoded ? "OK" : "null"}`);
        if (decoded) {
          setQrFields(mapQRToForm(decoded));
          setDebugLog([...logs]);
          // Purge QR preview — no Aadhaar images kept in memory beyond this point
          setQrPreviewURL(null);
          const cap = captureRef.current;
          if (cap) cap.getContext("2d")?.clearRect(0, 0, cap.width, cap.height);
          await startCamera();
          setPhase("camera_num");
          return;
        }
      }
    } catch (e) {
      log(`ERR: ${e instanceof Error ? e.message : String(e)}`);
    }

    setDebugLog([...logs]);
    setRetryInfo({
      reason: "QR code not detected",
      suggestion: "Move closer until the QR code completely fills the square. Keep it sharp and well-lit.",
      retryPhase: "camera_qr",
    });
    setPhase("retry");
  }, [startCamera]);

  // ── Step 2: OCR Aadhaar number ────────────────────────────────────────────
  const analyseNum = useCallback(async () => {
    setPhase("processing_num");
    const c = captureRef.current;
    if (c) {
      try {
        const { ocrAadhaarNumber } = await import("@/lib/aadhaar/ocr-processor");
        const { cx, cy, cw, ch } = cardRect(c.width, c.height);
        const aaRes = await ocrAadhaarNumber(c, { cx, cy, cw, ch });
        setAadhaarVerified(aaRes.verified);
        setFields({ ...qrFields, aadhaarNumber: aaRes.number ?? undefined });
      } catch {
        setFields({ ...qrFields });
      }
    } else {
      setFields({ ...qrFields });
    }
    // Purge all captured images — nothing persists beyond extraction
    setNumPreviewURL(null);
    setQrPreviewURL(null);
    const cap = captureRef.current;
    if (cap) cap.getContext("2d")?.clearRect(0, 0, cap.width, cap.height);
    setPhase("confirm");
  }, [qrFields]);

  // ── Retake ────────────────────────────────────────────────────────────────
  const retake = useCallback(async (targetPhase: "camera_qr" | "camera_num") => {
    setRetryInfo(null);
    setDebugLog([]);
    await startCamera();
    setPhase(targetPhase);
  }, [startCamera]);

  const setField = (k: keyof AadhaarFormFields) => (v: string) =>
    setFields(f => ({ ...f, [k]: v }));

  const isCameraPhase = phase === "camera_qr" || phase === "camera_num";

  // ── Confirm ───────────────────────────────────────────────────────────────
  if (phase === "confirm") {
    return (
      <div style={S.backdrop}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}} @media(max-width:500px){.acgrid{grid-template-columns:1fr!important}}`}</style>
        <div style={S.confirmCard}>
          <div style={S.confirmHeader}>
            <span style={S.confirmTitle}>Review Extracted Details</span>
            <button style={S.xBtn} onClick={onClose}>✕</button>
          </div>

          {!fields.aadhaarNumber && (
            <div style={S.partialBanner}>
              <strong>Aadhaar number not captured</strong> — please type it from the physical card below.
            </div>
          )}
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
              <div key={key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
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

            <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
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

      {/* Camera (always in DOM so refs stay attached) */}
      <div style={{ ...S.camWrap, display: isCameraPhase ? "flex" : "none" }}>
        <video ref={videoRef} style={S.video} playsInline muted autoPlay />
        <canvas ref={overlayRef} style={S.overlay} />
        <canvas ref={captureRef} style={{ display: "none" }} />

        <div style={S.topBar}>
          <div>
            <span style={S.phaseChip}>
              {phase === "camera_qr" ? "STEP 1 OF 2 · QR CODE" : "STEP 2 OF 2 · AADHAAR NUMBER"}
            </span>
            <span style={S.phaseLabel}>
              {phase === "camera_qr"
                ? "Aim at the QR code on the back of the Aadhaar card"
                : "Show the full back of the Aadhaar card"}
            </span>
          </div>
          <button style={S.xBtn} onClick={() => { stopCamera(); onClose(); }}>✕</button>
        </div>

        {camError && <div style={S.errorBanner}>{camError}</div>}

        <div style={S.bottomBar}>
          <p style={S.bottomHint}>
            {phase === "camera_qr"
              ? "Move close · QR code should fill the square · Hold steady"
              : "Full card in frame · Aadhaar number at bottom must be visible"}
          </p>
          <button style={S.shutterBtn} onClick={capturePhoto} aria-label="Capture photo">
            <span style={S.shutterInner} />
          </button>
          <p style={{ ...S.bottomHint, fontSize: 11, opacity: 0.55 }}>Tap to capture</p>
        </div>
      </div>

      {/* Preview */}
      {(phase === "preview_qr" || phase === "preview_num") && (
        <div style={S.fullScreen}>
          <img
            src={(phase === "preview_qr" ? qrPreviewURL : numPreviewURL) ?? ""}
            alt="Captured"
            style={S.capturedImg}
          />
          <div style={S.screenTop}>
            <span style={S.screenTitle}>
              {phase === "preview_qr" ? "Check QR capture" : "Check card capture"}
            </span>
            <button style={S.xBtn} onClick={() => { stopCamera(); onClose(); }}>✕</button>
          </div>
          <div style={S.screenBottom}>
            <p style={S.hintWhite}>
              {phase === "preview_qr"
                ? "Is the QR code sharp and fully in frame?"
                : "Is the Aadhaar number at the bottom clearly readable?"}
            </p>
            <div style={S.rowBtns}>
              <button style={S.retakeBtn}
                onClick={() => retake(phase === "preview_qr" ? "camera_qr" : "camera_num")}>
                ↩ Retake
              </button>
              <button style={S.primaryBtn}
                onClick={phase === "preview_qr" ? analyseQR : analyseNum}>
                {phase === "preview_qr" ? "Decode QR →" : "Read Number →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Processing */}
      {(phase === "processing_qr" || phase === "processing_num") && (
        <div style={S.fullScreen}>
          <img
            src={(phase === "processing_qr" ? qrPreviewURL : numPreviewURL) ?? ""}
            alt=""
            style={{ ...S.capturedImg, opacity: 0.25 }}
          />
          <div style={S.centreBox}>
            <div style={S.spinner} />
            <span style={S.boxTitle}>
              {phase === "processing_qr" ? "Decoding QR code…" : "Reading Aadhaar number…"}
            </span>
            <span style={S.boxHint}>
              {phase === "processing_qr"
                ? "Detecting QR · Decoding payload"
                : "Running OCR on number strip"}
            </span>
          </div>
        </div>
      )}

      {/* Retry */}
      {phase === "retry" && retryInfo && (
        <div style={S.fullScreen}>
          {(retryInfo.retryPhase === "camera_qr" ? qrPreviewURL : numPreviewURL) && (
            <img
              src={(retryInfo.retryPhase === "camera_qr" ? qrPreviewURL : numPreviewURL)!}
              alt=""
              style={{ ...S.capturedImg, opacity: 0.25 }}
            />
          )}
          <div style={S.centreBox}>
            <div style={S.retryIcon}>✕</div>
            <span style={S.boxTitle}>{retryInfo.reason}</span>
            <span style={S.boxHint}>{retryInfo.suggestion}</span>
            <button style={S.retryActionBtn} onClick={() => retake(retryInfo.retryPhase)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              Try Again
            </button>
          </div>
          {debugLog.length > 0 && (
            <div style={S.debugPanel}>
              {debugLog.map((l, i) => <span key={i} style={S.debugLine}>{l}</span>)}
            </div>
          )}
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
  retryActionBtn: { width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "15px 0", background: "#fff", color: "#0C1929", border: "none", borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: "pointer", letterSpacing: "0.01em", marginTop: 4 },
  debugPanel:   { position: "absolute", bottom: 12, left: 12, right: 12, background: "rgba(0,0,0,.82)", borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column" as const, gap: 2, maxHeight: 160, overflowY: "auto" as const, zIndex: 3 },
  debugLine:    { fontFamily: "monospace", fontSize: 10, color: "#A3E635", lineHeight: 1.5 },

  // Confirm card
  confirmCard:    { background: "#fff", borderRadius: 20, width: "100%", maxWidth: 580, maxHeight: "92vh", overflowY: "auto" as const, padding: "28px 32px", boxShadow: "0 24px 80px rgba(0,0,0,.35)", margin: 16 },
  confirmHeader:  { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  confirmTitle:   { fontSize: 18, fontWeight: 700, color: "#0C1929" },
  confirmSub:     { fontSize: 13, color: "#888", marginBottom: 20, marginTop: 4 },
  confirmGrid:    { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px", marginBottom: 24 },
  confirmActions: { display: "flex", justifyContent: "flex-end", gap: 12 },
  fLabel:         { fontSize: 10, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase" as const, color: "#666", display: "flex", alignItems: "center", gap: 8 },
  fInput:         { padding: "9px 12px", border: "1.5px solid #E2E0DC", borderRadius: 8, fontSize: 14, color: "#111", outline: "none", width: "100%", boxSizing: "border-box" as const },
  cancelBtn:      { padding: "10px 22px", border: "1.5px solid #E2E0DC", background: "none", borderRadius: 9, fontSize: 14, fontWeight: 600, color: "#666", cursor: "pointer" },
  applyBtn:       { padding: "10px 26px", background: "#0C1929", color: "#fff", border: "none", borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  partialBanner:  { background: "#FEF3C7", border: "1.5px solid #FCD34D", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#92400E", marginBottom: 12, lineHeight: 1.5 },
  verifiedBadge:  { fontSize: 11, fontWeight: 700, color: "#166534", background: "#DCFCE7", borderRadius: 20, padding: "2px 8px" },
  unverifiedBadge:{ fontSize: 11, fontWeight: 600, color: "#92400E", background: "#FEF3C7", borderRadius: 20, padding: "2px 8px" },
};
