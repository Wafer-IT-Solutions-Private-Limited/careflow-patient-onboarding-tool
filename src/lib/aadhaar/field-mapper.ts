import type { AadhaarQRData } from "./qr-decoder";

export interface AadhaarFormFields {
  name?:        string;
  dateOfBirth?: string;  // YYYY-MM-DD for input[type=date]
  gender?:      string;  // Male | Female | Other
  address?:     string;
  city?:        string;
  state?:       string;
  pincode?:     string;
}

// ── DOB: DD/MM/YYYY or DD-MM-YYYY or YYYY → YYYY-MM-DD ──────────────────────
export function parseDOB(raw: string): string | undefined {
  if (!raw) return undefined;

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = raw.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;

  // YYYY-MM-DD already correct
  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) return raw;

  // YYYY only — return undefined (incomplete)
  return undefined;
}

// ── Gender: M/F/T → Male/Female/Other ───────────────────────────────────────
function mapGender(g: string | undefined): string | undefined {
  if (!g) return undefined;
  const u = g.toUpperCase();
  if (u === "M" || u === "MALE")   return "Male";
  if (u === "F" || u === "FEMALE") return "Female";
  if (u === "T" || u === "OTHER")  return "Other";
  return undefined;
}

// ── Build address line from granular QR fields ───────────────────────────────
function buildAddress(d: AadhaarQRData): string | undefined {
  const parts = [d.house, d.street, d.landmark, d.locality].filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

// ── Map QR demographic data → walk-in form fields ───────────────────────────
export function mapQRToForm(data: AadhaarQRData): AadhaarFormFields {
  return {
    name:        data.name,
    dateOfBirth: parseDOB(data.dob ?? ""),
    gender:      mapGender(data.gender),
    address:     buildAddress(data),
    city:        data.vtc || data.district,
    state:       data.state,
    pincode:     data.pincode,
  };
}

// ── Merge OCR front + OCR back results ───────────────────────────────────────
export function mergeOCRFields(
  front: Partial<AadhaarFormFields>,
  back:  Partial<AadhaarFormFields>,
): AadhaarFormFields {
  return { ...front, ...back };
}
