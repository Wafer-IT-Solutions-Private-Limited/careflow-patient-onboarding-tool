import type { AadhaarFormFields } from "./field-mapper";
import { parseDOB } from "./field-mapper";

// ── Verhoeff check-digit algorithm ────────────────────────────────────────────
const VD = [
  [0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],
  [3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],
  [6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],
  [9,8,7,6,5,4,3,2,1,0],
] as const;
const VP = [
  [0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],
  [8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],
  [2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8],
] as const;

export function verhoeff(num: string): boolean {
  let c = 0;
  const digits = num.split("").reverse().map(Number);
  for (let i = 0; i < digits.length; i++) {
    c = VD[c][VP[i % 8][digits[i]]];
  }
  return c === 0;
}

// ── Real-time frame quality assessment ───────────────────────────────────────
export interface FrameQuality {
  brightness: "low" | "ok" | "high";
  blur:       "blurry" | "ok";
  ready:      boolean;
  level:      "error" | "warn" | "good";
  message:    string;
}

export function assessFrameQuality(
  ctx:   CanvasRenderingContext2D,
  cropX: number,
  cropY: number,
  cropW: number,
  cropH: number,
): FrameQuality {
  const data  = ctx.getImageData(cropX, cropY, cropW, cropH).data;
  // Sample ~4000 pixels evenly for speed
  const step  = Math.max(4, Math.floor((cropW * cropH) / 4000)) * 4;

  let sum = 0, sumSq = 0, n = 0;
  for (let i = 0; i < data.length; i += step) {
    const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    sum  += lum;
    sumSq += lum * lum;
    n++;
  }

  const mean     = n ? sum / n : 0;
  const variance = n ? sumSq / n - mean * mean : 0;

  const brightness: "low" | "ok" | "high" =
    mean < 60 ? "low" : mean > 210 ? "high" : "ok";
  // High variance = sharp edges between dark text and white card background
  const blur: "blurry" | "ok" = variance < 280 ? "blurry" : "ok";

  const ready = brightness === "ok" && blur === "ok";

  let level: "error" | "warn" | "good";
  let message: string;

  if (brightness === "low") {
    level = "error"; message = "Too dark — move to better light";
  } else if (brightness === "high") {
    level = "warn";  message = "Too bright — tilt card to reduce glare";
  } else if (blur === "blurry") {
    level = "warn";  message = "Blurry — hold the card still";
  } else {
    level = "good";  message = "";
  }

  return { brightness, blur, ready, level, message };
}

// ── Canvas preprocessing for OCR ─────────────────────────────────────────────
export function preprocessImage(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width  = src.width;
  out.height = src.height;
  const ctx  = out.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  const img  = ctx.getImageData(0, 0, out.width, out.height);
  const d    = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    const c   = Math.min(255, Math.max(0, (lum - 128) * 1.5 + 128));
    d[i] = d[i + 1] = d[i + 2] = c;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

// ── Aadhaar number: 12 digits ─────────────────────────────────────────────────
function extractAadhaarNumber(text: string): string | null {
  const m = text.match(/\b(\d{4}\s?\d{4}\s?\d{4})\b/);
  return m ? m[1].replace(/\s/g, "") : null;
}

function extractDOB(text: string): string | undefined {
  const m = text.match(/\b(\d{2}[\/\-]\d{2}[\/\-]\d{4}|\d{4})\b/);
  return m ? parseDOB(m[0]) : undefined;
}

function extractGender(text: string): string | undefined {
  if (/\bfemale\b/i.test(text)) return "Female";
  if (/\bmale\b/i.test(text))   return "Male";
  if (/\bother\b/i.test(text))  return "Other";
  return undefined;
}

function extractPincode(text: string): string | undefined {
  const matches = text.match(/\b\d{6}\b/g);
  return matches ? matches[matches.length - 1] : undefined;
}

// ── OCR field extraction by card side ────────────────────────────────────────
export function extractFieldsFromText(
  text: string,
  side: "front" | "back",
): Partial<AadhaarFormFields> {
  if (side === "front") {
    const lines    = text.split("\n").map(l => l.trim()).filter(Boolean);
    const nameLine = lines.find(l => /^[A-Z][A-Z\s]{4,}$/.test(l));
    return {
      name:          nameLine,
      dateOfBirth:   extractDOB(text),
      gender:        extractGender(text),
      aadhaarNumber: extractAadhaarNumber(text) ?? undefined,
    };
  }

  const pincode    = extractPincode(text);
  const lines      = text.split("\n").map(l => l.trim()).filter(Boolean);
  const pincodeIdx = lines.findIndex(l => l.includes(pincode ?? ""));
  const addrLines  = pincodeIdx > 0 ? lines.slice(0, pincodeIdx + 1) : lines;
  const address    = addrLines.slice(0, 3).join(", ");
  const stateLine  = [...addrLines].reverse().find(l => /^[A-Z][A-Z\s]{3,}$/.test(l));
  const aadhaarNum = extractAadhaarNumber(text);

  return {
    address,
    state:         stateLine,
    pincode,
    aadhaarNumber: aadhaarNum ?? undefined,
  };
}

// ── OCR a card-side canvas via Tesseract (lazy-loaded) ───────────────────────
export async function runOCR(
  canvas: HTMLCanvasElement,
  side:   "front" | "back",
): Promise<Partial<AadhaarFormFields>> {
  const processed = preprocessImage(canvas);
  const dataURL   = processed.toDataURL("image/png");
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const { data } = await worker.recognize(dataURL);
    return extractFieldsFromText(data.text, side);
  } finally {
    await worker.terminate();
  }
}

// ── Extract Aadhaar number from the bottom strip of a camera frame ────────────
// Called after QR decode succeeds — grabs the 12-digit number from the card back.
export async function ocrAadhaarNumber(
  canvas: HTMLCanvasElement,
  rect:   { cx: number; cy: number; cw: number; ch: number },
): Promise<{ number: string | null; verified: boolean }> {
  // Aadhaar number sits at ~73–86% of card height.
  // Narrower strip avoids the footer row (phone/email/website) that contains "1947".
  const sx = rect.cx;
  const sy = rect.cy + Math.floor(rect.ch * 0.73);
  const sw = rect.cw;
  const sh = Math.floor(rect.ch * 0.13);
  if (sh < 10) return { number: null, verified: false };

  // Crop + scale 2× + binarize for clean digit recognition
  const out   = document.createElement("canvas");
  out.width   = sw * 2;
  out.height  = sh * 2;
  const ctx   = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height);

  const img = ctx.getImageData(0, 0, out.width, out.height);
  const px  = img.data;
  for (let i = 0; i < px.length; i += 4) {
    const lum = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
    const v   = lum > 140 ? 255 : 0;
    px[i] = px[i + 1] = px[i + 2] = v;
    px[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  await worker.setParameters({
    tessedit_char_whitelist: "0123456789 ",
    // PSM 7 = single text line — ideal for the Aadhaar number band
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tessedit_pageseg_mode: "7" as any,
  });

  try {
    const { data } = await worker.recognize(out.toDataURL("image/png"));
    const digits   = data.text.replace(/[^0-9]/g, "");
    const m        = digits.match(/\d{12}/);
    if (!m) return { number: null, verified: false };
    return { number: m[0], verified: verhoeff(m[0]) };
  } finally {
    await worker.terminate();
  }
}
