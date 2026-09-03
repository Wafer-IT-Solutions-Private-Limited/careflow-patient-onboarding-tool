import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import bcrypt from "bcryptjs";

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get("token")?.value;
  if (!token) return null;
  try {
    const s = await verifyToken(token);
    return s.role === "ADMIN" ? s : null;
  } catch { return null; }
}

// GET /api/admin/nurses
export async function GET(req: NextRequest) {
  if (!await requireAdmin(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const nurses = await prisma.nurse.findMany({
      include: { user: { select: { id: true, name: true, email: true, isVerified: true, createdAt: true } } },
      orderBy: { user: { name: "asc" } },
    });
    return NextResponse.json({ nurses });
  } catch (e) {
    const msg = process.env.NODE_ENV === "production" ? "Internal server error" : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/admin/nurses
export async function POST(req: NextRequest) {
  if (!await requireAdmin(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { name, email, password, approved } = await req.json();
    if (!name || !email || !password)
      return NextResponse.json({ error: "Name, email and password are required" }, { status: 400 });

    // Enforce nurse email pattern
    if (!/^[a-zA-Z0-9]+\.nurse@hospital\.com$/i.test(email))
      return NextResponse.json({ error: "Nurse email must follow pattern: firstname.nurse@hospital.com" }, { status: 400 });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return NextResponse.json({ error: "Email already in use" }, { status: 409 });

    const hash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        name, email, password: hash, role: "NURSE", isVerified: true,
        nurseProfile: { create: { approved: approved ?? true } },
      },
      include: { nurseProfile: true },
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (e) {
    const msg = process.env.NODE_ENV === "production" ? "Internal server error" : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
