import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { loginSchema, detectRoleFromEmail } from "@/lib/validators/auth";
import { ROLE_REDIRECTS } from "@/constants/roles";

export async function POST(req: NextRequest) {
  try {
    const body   = await req.json();
    const result = loginSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 },
      );
    }

    const { email, password } = result.data;

    // Determine expected role from the email domain before hitting the DB
    const expectedRole = detectRoleFromEmail(email);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // Verify the stored role matches the email domain the user typed.
    // This prevents a patient using a doctor's hospital email format, etc.
    if (user.role !== expectedRole) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const token = await signToken({
      id:    user.id,
      email: user.email,
      name:  user.name,
      role:  user.role,
    });

    const redirectTo = ROLE_REDIRECTS[user.role] ?? "/";

    const response = NextResponse.json({
      user:       { id: user.id, name: user.name, email: user.email, role: user.role },
      redirectTo,
    });

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
    console.error("[LOGIN ERROR]", msg);
    return NextResponse.json(
      { error: process.env.NODE_ENV === "development" ? msg : "Internal server error" },
      { status: 500 },
    );
  }
}
