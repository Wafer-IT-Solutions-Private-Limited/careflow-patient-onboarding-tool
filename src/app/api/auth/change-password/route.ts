import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { verifyToken, signToken } from "@/lib/auth";

// POST /api/auth/change-password — used on first-login forced password change
export async function POST(req: NextRequest) {
  try {
    const cookie = req.cookies.get("token");
    if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const jwt = await verifyToken(cookie.value);

    const { newPassword } = await req.json();
    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: jwt.id },
      data:  { password: hash, mustChangePassword: false },
    });

    // Issue new token with mustChangePassword: false
    const patient = await prisma.patient.findFirst({ where: { userId: jwt.id } });
    const newToken = await signToken({
      id:   jwt.id,
      email: jwt.email ?? undefined,
      name:  jwt.name,
      role:  jwt.role,
      mustChangePassword: false,
    });

    const redirectTo = (jwt.role === "PATIENT" && patient && !patient.healthSetupComplete)
      ? "/health-setup"
      : "/patient";

    const response = NextResponse.json({ success: true, redirectTo });
    response.cookies.set("token", newToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 60 * 60 * 24 * 7, path: "/" });
    return response;
  } catch (e) {
    const msg = process.env.NODE_ENV === "production" ? "Internal server error" : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
