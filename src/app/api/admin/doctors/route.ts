import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function GET(req: NextRequest) {
  try {
    const cookie = req.cookies.get("token");
    if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const jwt = await verifyToken(cookie.value);
    if (jwt.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const doctors = await prisma.doctor.findMany({
      include: {
        user: { select: { id: true, name: true, email: true, isVerified: true, createdAt: true } },
        _count: { select: { visits: true } },
      },
      orderBy: { user: { name: "asc" } },
    });
    return NextResponse.json({ doctors });
  } catch (e) {
    const msg = process.env.NODE_ENV === "production" ? "Internal server error" : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const cookie = req.cookies.get("token");
    if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const jwt = await verifyToken(cookie.value);
    if (jwt.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { name, email, password, licenseNumber, specialization, approved } = await req.json();
    if (!name || !email || !password || !licenseNumber || !specialization)
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return NextResponse.json({ error: "Email already in use" }, { status: 409 });

    if (!email.endsWith("@hospital.com"))
      return NextResponse.json({ error: "Doctor email must use @hospital.com" }, { status: 400 });

    const hash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        name, email, password: hash, role: "DOCTOR", isVerified: true,
        doctorProfile: { create: { licenseNumber, specialization, approved: approved ?? false } },
      },
      include: { doctorProfile: true },
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (e) {
    const msg = process.env.NODE_ENV === "production" ? "Internal server error" : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

