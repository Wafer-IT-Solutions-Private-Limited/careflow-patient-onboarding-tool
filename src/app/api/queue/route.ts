import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

// GET /api/queue â€” today's full queue (admin/doctor)
export async function GET(req: NextRequest) {
  try {
    const cookie = req.cookies.get("token");
    if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const jwt = await verifyToken(cookie.value);
    if (jwt.role !== "ADMIN" && jwt.role !== "DOCTOR")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);

    const visits = await prisma.visit.findMany({
      where: { visitDate: { gte: todayStart, lte: todayEnd } },
      include: {
        patient: { select: { prn: true, name: true, gender: true, phone: true, priority: true } },
        doctor:  { include: { user: { select: { name: true } } } },
        queue:   true,
      },
      orderBy: [{ queuePosition: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ visits });
  } catch (e) {
    const msg = process.env.NODE_ENV === "production" ? "Internal server error" : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

