import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { todayISTStart } from "@/lib/timezone";

// GET /api/admin/appointments — future SCHEDULED appointments (tomorrow onwards)
export async function GET(req: NextRequest) {
  try {
    const cookie = req.cookies.get("token");
    if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const jwt = await verifyToken(cookie.value);
    if (jwt.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const todayStart = todayISTStart();
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const appointments = await prisma.visit.findMany({
      where: {
        status: "SCHEDULED",
        appointmentDate: { gte: tomorrowStart },
      },
      include: {
        patient: { select: { prn: true, name: true, priority: true, phone: true } },
        doctor:  { include: { user: { select: { name: true } } } },
      },
      orderBy: { appointmentDate: "asc" },
    });

    return NextResponse.json({ appointments });
  } catch (e) {
    const msg = process.env.NODE_ENV === "production" ? "Internal server error" : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
