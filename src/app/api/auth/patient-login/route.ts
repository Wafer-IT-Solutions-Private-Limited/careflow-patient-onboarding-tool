import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

// POST /api/auth/patient-login — login with phone or PRN
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
    const rl = checkRateLimit(`patient-login:${ip}`);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many login attempts. Try again in ${Math.ceil(rl.retryAfterSecs / 60)} minutes.` },
        { status: 429 }
      );
    }

    const { identifier, password } = await req.json();
    if (!identifier?.trim() || !password) {
      return NextResponse.json({ error: "Phone/PRN and password are required" }, { status: 400 });
    }

    const id = identifier.trim();

    // Auto-detect: PRN starts with "PAT-", everything else treated as phone
    const isPRN = id.toUpperCase().startsWith("PAT-");
    const patient = await prisma.patient.findFirst({
      where: isPRN ? { prn: id.toUpperCase() } : { phone: id },
    });

    if (!patient || !patient.userId) {
      return NextResponse.json({ error: "No account found. Please contact the hospital reception." }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: patient.userId } });
    if (!user) return NextResponse.json({ error: "Account not found" }, { status: 401 });

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });

    const token = await signToken({
      id:   user.id,
      email: user.email ?? undefined,
      name:  user.name,
      role:  "PATIENT",
      mustChangePassword: user.mustChangePassword,
    });

    let redirectTo = "/patient";
    if (user.mustChangePassword) redirectTo = "/change-password";
    else if (!patient.healthSetupComplete) redirectTo = "/health-setup";

    const response = NextResponse.json({
      user: { id: user.id, name: user.name, role: "PATIENT" },
      redirectTo,
    });
    response.cookies.set("token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 60 * 60 * 24 * 7, path: "/" });
    return response;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: process.env.NODE_ENV === "development" ? msg : "Internal server error" }, { status: 500 });
  }
}
