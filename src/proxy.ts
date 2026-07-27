import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

const PROTECTED: Record<string, string[]> = {
  "/admin":        ["ADMIN"],
  "/doctor":       ["DOCTOR"],
  "/patient":      ["PATIENT"],
  "/walk-in":      ["ADMIN", "DOCTOR"],
  "/health-setup": ["PATIENT"],
};

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const match = Object.entries(PROTECTED).find(([prefix]) => pathname.startsWith(prefix));
  if (!match) return NextResponse.next();

  const [, allowedRoles] = match;
  const cookie = req.cookies.get("token");
  if (!cookie) return NextResponse.redirect(new URL("/login", req.url));

  try {
    const payload = await verifyToken(cookie.value);
    if (!allowedRoles.includes(payload.role)) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

