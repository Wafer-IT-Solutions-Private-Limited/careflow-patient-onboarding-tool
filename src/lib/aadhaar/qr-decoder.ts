import { inflate } from "pako";

export interface AadhaarQRData {
  name?:        string;
  dob?:         string;
  gender?:      string;
  co?:          string;   // care-of (father / husband name)
  house?:       string;
  street?:      string;
  landmark?:    string;
  locality?:    string;
  vtc?:         string;   // village / town / city
  subDistrict?: string;
  district?:    string;
  state?:       string;
  country?:     string;
  pincode?:     string;
}

// ── Convert a large decimal string to a byte array ───────────────────────────
function decimalToBytes(decimal: string): Uint8Array {
  let n = BigInt(decimal);
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  return new Uint8Array(bytes);
}

// ── Extract an XML attribute value ───────────────────────────────────────────
function attr(xml: string, name: string): string | undefined {
  const m = xml.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? m[1].trim() || undefined : undefined;
}

// ── Parse both flat and nested Aadhaar XML formats ──────────────────────────
function parseXML(xml: string): AadhaarQRData {
  // Nested format: <Poi ...> and <Poa ...> child elements
  const poiMatch = xml.match(/<Poi([^/]*)\/>/i);
  const poaMatch = xml.match(/<Poa([^/]*)\/>/i);

  const poiStr = poiMatch ? poiMatch[1] : xml;
  const poaStr = poaMatch ? poaMatch[1] : xml;

  return {
    name:        attr(poiStr, "name"),
    dob:         attr(poiStr, "dob"),
    gender:      attr(poiStr, "gender"),
    co:          attr(poaStr, "co"),
    house:       attr(poaStr, "house"),
    street:      attr(poaStr, "street"),
    landmark:    attr(poaStr, "lm"),
    locality:    attr(poaStr, "loc"),
    vtc:         attr(poaStr, "vtc"),
    subDistrict: attr(poaStr, "subdist"),
    district:    attr(poaStr, "dist"),
    state:       attr(poaStr, "state"),
    country:     attr(poaStr, "country"),
    pincode:     attr(poaStr, "pc"),
  };
}

// ── Decode Aadhaar Secure QR (BigInt → zlib → XML) ──────────────────────────
function decodeSecureQR(decimal: string): AadhaarQRData | null {
  const bytes   = decimalToBytes(decimal);
  const version = bytes[0];

  // RSA-2048 signature = last 256 bytes; ECDSA (v2) = last 32 bytes
  const sigLen  = version === 2 ? 32 : 256;
  if (bytes.length <= sigLen + 1) return null;

  const compressed = bytes.slice(1, bytes.length - sigLen);
  const xml = new TextDecoder("utf-8").decode(inflate(compressed));
  return parseXML(xml);
}

// ── Public decode entry point ────────────────────────────────────────────────
export function decodeAadhaarQR(qrString: string): AadhaarQRData | null {
  try {
    // Primary: Secure QR — a large decimal number (>100 digits)
    if (/^\d+$/.test(qrString) && qrString.length > 100) {
      return decodeSecureQR(qrString);
    }

    // Fallback: plain XML QR (older / manually generated cards)
    if (qrString.trim().startsWith("<")) {
      return parseXML(qrString);
    }

    return null;
  } catch {
    return null;
  }
}
