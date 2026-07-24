import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

const roleRoutes: Record<string, string> = {
  "/admin": "ADMIN",
  "/doctor": "DOCTOR",
  "/patient": "PATIENT",
};

export async function middleware(req: NextRequest) {
  const token = req.cookies.get("token")?.value;
  const path = req.nextUrl.pathname;

  const matchedPrefix = Object.keys(roleRoutes).find((prefix) =>
    path.startsWith(prefix)
  );
  if (!matchedPrefix) return NextResponse.next();

  if (!token) return NextResponse.redirect(new URL("/login", req.url));

  try {
    const decoded = await verifyToken(token);
    if (decoded.role !== roleRoutes[matchedPrefix]) {
      return NextResponse.redirect(new URL("/unauthorized", req.url));
    }
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = {
  matcher: ["/admin/:path*", "/doctor/:path*", "/patient/:path*"],
};
