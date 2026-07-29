import type { AadhaarFormFields } from "./field-mapper";
import { parseDOB } from "./field-mapper";

// ── Preprocess canvas region for better OCR accuracy ────────────────────────
// Grayscale + contrast boost → dramatically improves Tesseract on real cards
export function preprocessImage(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width  = src.width;
  out.height = src.height;
  const ctx  = out.getContext("2d")!;
  ctx.drawImage(src, 0, 0);

  const img  = ctx.getImageData(0, 0, out.width, out.height);
  const data = img.data;

  for (let i = 0; i < data.length; i += 4) {
    // Grayscale (luminance)
    const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    // Contrast stretch: push towards black or white
    const c = Math.min(255, Math.max(0, (lum - 128) * 1.5 + 128));
    data[i] = data[i + 1] = data[i + 2] = c;
  }

  ctx.putImageData(img, 0, 0);
  return out;
}

// ── Aadhaar number: 12 digits with optional spaces ───────────────────────────
function extractAadhaarNumber(text: string): string | undefined {
  const m = text.match(/\b\d{4}\s?\d{4}\s?\d{4}\b/);
  return m ? m[0].replace(/\s/g, "") : undefined;
}

// ── Date of birth ─────────────────────────────────────────────────────────────
function extractDOB(text: string): string | undefined {
  // DOB: 12/05/1990 or 12-05-1990 or 1990
  const m = text.match(/\b(\d{2}[\/\-]\d{2}[\/\-]\d{4}|\d{4})\b/);
  return m ? parseDOB(m[0]) : undefined;
}

// ── Gender ────────────────────────────────────────────────────────────────────
function extractGender(text: string): string | undefined {
  if (/\bfemale\b/i.test(text)) return "Female";
  if (/\bmale\b/i.test(text))   return "Male";
  if (/\bother\b/i.test(text))  return "Other";
  return undefined;
}

// ── 6-digit Indian pincode ────────────────────────────────────────────────────
function extractPincode(text: string): string | undefined {
  const matches = text.match(/\b\d{6}\b/g);
  return matches ? matches[matches.length - 1] : undefined;
}

// ── Parse OCR text into form fields by card side ─────────────────────────────
export function extractFieldsFromText(
  text:  string,
  side:  "front" | "back",
): Partial<AadhaarFormFields> {
  if (side === "front") {
    const lines     = text.split("\n").map(l => l.trim()).filter(Boolean);
    // Heuristic: the name line is typically all-caps and appears above DOB
    const nameLine  = lines.find(l => /^[A-Z][A-Z\s]{4,}$/.test(l));
    return {
      name:        nameLine,
      dateOfBirth: extractDOB(text),
      gender:      extractGender(text),
    };
  }

  // Back side — extract address block and pincode
  const pincode = extractPincode(text);
  const lines   = text.split("\n").map(l => l.trim()).filter(Boolean);

  // Address: lines that look like an address (before or containing the pincode)
  const pincodeIdx = lines.findIndex(l => l.includes(pincode ?? ""));
  const addrLines  = pincodeIdx > 0 ? lines.slice(0, pincodeIdx + 1) : lines;
  const address    = addrLines.slice(0, 3).join(", ");

  // State: last all-caps line before pincode
  const stateLine  = addrLines.reverse().find(l => /^[A-Z][A-Z\s]{3,}$/.test(l));

  return {
    address,
    state:   stateLine,
    pincode,
  };
}

// ── Run Tesseract OCR on a preprocessed canvas (lazy-loaded) ─────────────────
export async function runOCR(
  canvas: HTMLCanvasElement,
  side:   "front" | "back",
): Promise<Partial<AadhaarFormFields>> {
  const processed = preprocessImage(canvas);
  const dataURL   = processed.toDataURL("image/png");

  // Lazy-load tesseract.js only when OCR is actually needed
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");

  try {
    const { data } = await worker.recognize(dataURL);
    return extractFieldsFromText(data.text, side);
  } finally {
    await worker.terminate();
  }
}
