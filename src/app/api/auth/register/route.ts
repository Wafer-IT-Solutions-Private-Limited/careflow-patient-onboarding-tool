import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { patientRegisterSchema, detectRoleFromEmail } from "@/lib/validators/auth";
import { generatePRN } from "@/lib/counters";

export async function POST(req: NextRequest) {
  try {
    const body   = await req.json();
    const result = patientRegisterSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 },
      );
    }

    const { name, email, password } = result.data;

    // Reject hospital domain emails — only patients self-register
    if (detectRoleFromEmail(email) !== "PATIENT") {
      return NextResponse.json(
        { error: "Hospital staff accounts must be created by an administrator." },
        { status: 400 },
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }

    const hash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password:   hash,
        role:       "PATIENT",
        isVerified: true,
        patientProfile: { create: { prn: await generatePRN(), name } },
      },
    });

    const token = await signToken({
      id:    user.id,
      email: user.email,
      name:  user.name,
      role:  user.role,
    });

    const response = NextResponse.json(
      { user: { id: user.id, name: user.name, email: user.email, role: user.role }, redirectTo: "/health-setup" },
      { status: 201 },
    );

    response.cookies.set("token", token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge:   60 * 60 * 24 * 7,
      path:     "/",
    });

    return response;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[REGISTER ERROR]", msg);
    return NextResponse.json(
      { error: process.env.NODE_ENV === "development" ? msg : "Registration failed" },
      { status: 500 },
    );
  }
}
