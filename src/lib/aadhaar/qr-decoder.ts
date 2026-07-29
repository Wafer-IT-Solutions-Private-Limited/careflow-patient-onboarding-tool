import { inflate, ungzip } from "pako";

export interface AadhaarQRData {
  name?:        string;
  dob?:         string;
  gender?:      string;
  co?:          string;
  house?:       string;
  street?:      string;
  landmark?:    string;
  locality?:    string;
  vtc?:         string;
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

// ── XML attribute helper ─────────────────────────────────────────────────────
function attr(xml: string, name: string): string | undefined {
  const m = xml.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? m[1].trim() || undefined : undefined;
}

// ── Parse both flat and nested Aadhaar XML formats ──────────────────────────
function parseXML(xml: string): AadhaarQRData {
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

// ── Parse binary 0xFF-delimited Aadhaar QR format ───────────────────────────
// Field order confirmed from real card: [0]=type [1]=ref-id [2]=name [3]=dob
// [4]=gender [5]=? [6]=district [7]=? [8]=address [9]=locality
// [10]=pincode [11]=? [12]=state [13]=? [14]=? [15]=city/vtc
function parseDelimited(raw: Uint8Array): AadhaarQRData {
  const fields: string[] = [];
  const dec = new TextDecoder("utf-8", { fatal: false });
  let start = 0;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === 0xFF) {
      fields.push(dec.decode(raw.slice(start, i)));
      start = i + 1;
    }
  }
  if (start < raw.length) fields.push(dec.decode(raw.slice(start)));

  const f = (i: number) => fields[i]?.trim() || undefined;

  return {
    name:     f(2),
    dob:      f(3),
    gender:   f(4),
    district: f(6),
    house:    f(8),
    locality: f(9),
    pincode:  f(10),
    state:    f(12),
    vtc:      f(15),
  };
}

// ── Decompress QR bytes (gzip or zlib) ──────────────────────────────────────
function decompress(bytes: Uint8Array): Uint8Array {
  if (bytes[0] === 0x1F && bytes[1] === 0x8B) return ungzip(bytes);
  return inflate(bytes);
}

// ── Decode Aadhaar Secure QR: decimal → bytes → decompress → parse ───────────
function decodeSecureQR(decimal: string): AadhaarQRData | null {
  const bytes = decimalToBytes(decimal);
  if (bytes.length < 10) return null;

  let raw: Uint8Array;

  if (bytes[0] === 0x1F && bytes[1] === 0x8B) {
    // Entire byte array is a raw gzip stream (most common real-card format)
    raw = ungzip(bytes);
  } else if (bytes[0] === 0x78) {
    // Raw zlib stream
    raw = inflate(bytes);
  } else if (bytes[0] === 2) {
    // Secure QR V2: version byte 2 + payload + 32-byte ECDSA signature
    const inner = bytes.slice(1, bytes.length - 32);
    raw = decompress(inner);
  } else {
    // Secure QR V1: version byte + payload + 256-byte RSA signature
    const inner = bytes.slice(1, bytes.length - 256);
    if (inner.length < 4) return null;
    raw = decompress(inner);
  }

  // Check if decompressed content is XML
  const prefix = new TextDecoder("utf-8", { fatal: false }).decode(raw.slice(0, 5));
  if (prefix.trimStart().startsWith("<")) {
    return parseXML(new TextDecoder("utf-8").decode(raw));
  }

  // Binary 0xFF-delimited format
  return parseDelimited(raw);
}

// ── Public decode entry point ────────────────────────────────────────────────
export function decodeAadhaarQR(qrString: string): AadhaarQRData | null {
  try {
    if (/^\d+$/.test(qrString) && qrString.length > 100) {
      return decodeSecureQR(qrString);
    }
    if (qrString.trim().startsWith("<")) {
      return parseXML(qrString);
    }
    return null;
  } catch {
    return null;
  }
}
