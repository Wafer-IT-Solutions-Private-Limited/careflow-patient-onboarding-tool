import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { patientRegisterSchema } from "@/lib/validators/auth";
import { generatePRN } from "@/lib/counters";

function hashAadhaar(raw: string) {
  return createHash("sha256").update(raw.replace(/\s/g, "")).digest("hex");
}

export async function POST(req: NextRequest) {
  try {
    const body   = await req.json();
    const result = patientRegisterSchema.safeParse(body);
    if (!result.success) return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });

    const { name, phone, dateOfBirth, aadhaar, email, password } = result.data;

    // Phone uniqueness check
    const existingPhone = await prisma.patient.findFirst({ where: { phone } });
    if (existingPhone) return NextResponse.json({ error: "An account with this phone number already exists." }, { status: 409 });

    // Aadhaar uniqueness check
    const digits = aadhaar.replace(/\s/g, "");
    if (!/^\d{12}$/.test(digits)) return NextResponse.json({ error: "Aadhaar must be exactly 12 digits" }, { status: 400 });
    const aadhaarHash = hashAadhaar(digits);
    const existingAadhaar = await prisma.patient.findFirst({ where: { aadhaarHash } });
    if (existingAadhaar) return NextResponse.json({ error: "An account with this Aadhaar already exists." }, { status: 409 });

    // Email uniqueness (optional field)
    if (email) {
      const existingEmail = await prisma.user.findUnique({ where: { email } });
      if (existingEmail) return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }

    const hash = await bcrypt.hash(password, 12);
    const prn  = await generatePRN();

    const user = await prisma.user.create({
      data: {
        name,
        email: email || null,
        password: hash,
        role: "PATIENT",
        isVerified: true,
        patientProfile: {
          create: {
            prn,
            name,
            phone,
            dateOfBirth: new Date(dateOfBirth),
            aadhaarHash,
            healthSetupComplete: false,
          },
        },
      },
    });

    const token = await signToken({ id: user.id, email: user.email ?? undefined, name: user.name, role: "PATIENT" });

    const response = NextResponse.json(
      { user: { id: user.id, name: user.name, role: "PATIENT" }, redirectTo: "/health-setup" },
      { status: 201 },
    );
    response.cookies.set("token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 60 * 60 * 24 * 7, path: "/" });
    return response;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: process.env.NODE_ENV === "development" ? msg : "Registration failed" }, { status: 500 });
  }
}
