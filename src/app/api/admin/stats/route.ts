import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

// GET /api/admin/stats
export async function GET(req: NextRequest) {
  try {
    const cookie = req.cookies.get("token");
    if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const jwt = await verifyToken(cookie.value);
    if (jwt.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

    const [
      totalPatients, totalDoctors, todayVisits, waitingCount,
      inConsultation, completedToday, availableDoctors,
    ] = await Promise.all([
      prisma.patient.count(),
      prisma.doctor.count({ where: { approved: true } }),
      prisma.visit.count({ where: { visitDate: { gte: todayStart } } }),
      prisma.visit.count({ where: { status: "WAITING" } }),
      prisma.visit.count({ where: { status: "IN_CONSULTATION" } }),
      prisma.visit.count({ where: { status: "COMPLETED", visitDate: { gte: todayStart } } }),
      prisma.doctor.count({ where: { approved: true, availability: "AVAILABLE" } }),
    ]);

    return NextResponse.json({
      totalPatients, totalDoctors, todayVisits, waitingCount,
      inConsultation, completedToday, availableDoctors,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
