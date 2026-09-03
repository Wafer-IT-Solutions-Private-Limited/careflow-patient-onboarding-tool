import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

async function requireNurse(req: NextRequest) {
  const token = req.cookies.get("token")?.value;
  if (!token) return null;
  try {
    const s = await verifyToken(token);
    return s.role === "NURSE" || s.role === "ADMIN" ? s : null;
  } catch { return null; }
}

// GET /api/nurse/queue — active visits for nurse screen
export async function GET(req: NextRequest) {
  const jwt = await requireNurse(req);
  if (!jwt) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const visits = await prisma.visit.findMany({
      where: {
        status: { in: ["WAITING", "ASSIGNED", "IN_CONSULTATION"] },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      include: {
        patient: { select: { id: true, prn: true, name: true, gender: true, dateOfBirth: true, priority: true } },
        doctor:  { include: { user: { select: { name: true } } } },
        vitals:  true,
      },
    });

    return NextResponse.json({ visits });
  } catch (e) {
    const msg = process.env.NODE_ENV === "production" ? "Internal server error" : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
