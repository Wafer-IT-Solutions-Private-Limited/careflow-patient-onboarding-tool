import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { todayISTStart } from "@/lib/timezone";

async function requireNurse(req: NextRequest) {
  const token = req.cookies.get("token")?.value;
  if (!token) return null;
  try {
    const s = await verifyToken(token);
    return s.role === "NURSE" || s.role === "ADMIN" ? s : null;
  } catch { return null; }
}

// PATCH /api/nurse/queue — toggle urgent priority on a visit
export async function PATCH(req: NextRequest) {
  const jwt = await requireNurse(req);
  if (!jwt) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { visitId, priority } = await req.json();
    if (!visitId || !["NORMAL","URGENT","EMERGENCY"].includes(priority))
      return NextResponse.json({ error: "visitId and valid priority required" }, { status: 400 });

    const { todayISTStart } = await import("@/lib/timezone");
    const updated = await prisma.visit.updateMany({
      where: { id: visitId, status: { in: ["WAITING","ASSIGNED","IN_CONSULTATION"] }, visitDate: { gte: todayISTStart() } },
      data: { priority },
    });
    if (updated.count === 0)
      return NextResponse.json({ error: "Visit not found or not active today" }, { status: 404 });
    const { emitSSE } = await import("@/lib/sse");
    emitSSE({ type: "queue:updated", room: "nurse" });
    emitSSE({ type: "queue:updated", room: "admin" });
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = process.env.NODE_ENV === "production" ? "Internal server error" : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET /api/nurse/queue — active visits for nurse screen
export async function GET(req: NextRequest) {
  const jwt = await requireNurse(req);
  if (!jwt) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const visits = await prisma.visit.findMany({
      where: {
        status: { in: ["WAITING", "ASSIGNED", "IN_CONSULTATION"] },
        visitDate: { gte: todayISTStart() },
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
