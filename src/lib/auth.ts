import type { AuthUser } from "@/types/auth";

export type { AuthUser };

export interface JWTPayload extends AuthUser {
  iat?: number;
  exp?: number;
}

function base64url(data: string | Uint8Array): string {
  const str =
    typeof data === "string"
      ? data
      : Array.from(data, (b) => String.fromCharCode(b)).join("");
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64urlDecode(str: string): Uint8Array {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signToken(payload: Omit<JWTPayload, "iat" | "exp">): Promise<string> {
  const secret = process.env.JWT_SECRET!;
  const now = Math.floor(Date.now() / 1000);

  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(
    JSON.stringify({ ...payload, iat: now, exp: now + 7 * 24 * 60 * 60 })
  );

  const key = await getKey(secret);
  const sigBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${header}.${body}`)
  );

  return `${header}.${body}.${base64url(new Uint8Array(sigBuffer))}`;
}

export async function verifyToken(token: string): Promise<JWTPayload> {
  const secret = process.env.JWT_SECRET!;
  const parts = token.split(".");

  if (parts.length !== 3) throw new Error("Invalid token format");
  const [header, body, sig] = parts;

  const key = await getKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64urlDecode(sig).buffer as ArrayBuffer,
    new TextEncoder().encode(`${header}.${body}`)
  );

  if (!valid) throw new Error("Invalid token signature");

  const payload = JSON.parse(
    new TextDecoder().decode(base64urlDecode(body))
  ) as JWTPayload;

  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Token expired");
  }

  return payload;
}
