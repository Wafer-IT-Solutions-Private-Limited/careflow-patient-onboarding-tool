import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

// GET /api/doctor/dashboard
export async function GET(req: NextRequest) {
  try {
    const cookie = req.cookies.get("token");
    if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const jwt = await verifyToken(cookie.value);
    if (jwt.role !== "DOCTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const doctor = await prisma.doctor.findUnique({
      where: { userId: jwt.id },
      include: { user: { select: { name: true, email: true } } },
    });
    if (!doctor) return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 });

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

    const [currentVisit, queuedVisits, todayCompleted] = await Promise.all([
      prisma.visit.findFirst({
        where: { doctorId: doctor.id, status: "IN_CONSULTATION" },
        include: {
          patient: true,
          history: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.visit.findMany({
        where: { doctorId: doctor.id, status: "ASSIGNED", visitDate: { gte: todayStart } },
        include: { patient: { select: { prn: true, name: true, gender: true, priority: true } } },
        orderBy: { queuePosition: "asc" },
      }),
      prisma.visit.count({
        where: { doctorId: doctor.id, status: "COMPLETED", visitDate: { gte: todayStart } },
      }),
    ]);

    return NextResponse.json({ doctor, currentVisit, queuedVisits, todayCompleted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
