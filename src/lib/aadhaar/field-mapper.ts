import type { AadhaarQRData } from "./qr-decoder";

export interface AadhaarFormFields {
  name?:          string;
  dateOfBirth?:   string;  // YYYY-MM-DD
  gender?:        string;  // Male | Female | Other
  address?:       string;
  city?:          string;
  state?:         string;
  pincode?:       string;
  aadhaarNumber?: string;  // 12 digits, no spaces
}

export function parseDOB(raw: string): string | undefined {
  if (!raw) return undefined;
  const dmy = raw.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return undefined;
}

function mapGender(g: string | undefined): string | undefined {
  if (!g) return undefined;
  const u = g.toUpperCase();
  if (u === "M" || u === "MALE")   return "Male";
  if (u === "F" || u === "FEMALE") return "Female";
  if (u === "T" || u === "OTHER")  return "Other";
  return undefined;
}

function buildAddress(d: AadhaarQRData): string | undefined {
  const parts = [d.house, d.street, d.landmark, d.locality].filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

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

export function mergeOCRFields(
  front: Partial<AadhaarFormFields>,
  back:  Partial<AadhaarFormFields>,
): AadhaarFormFields {
  return { ...front, ...back };
}
