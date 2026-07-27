import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { estimatedWaitMinutes } from "@/lib/queue";

// GET /api/patient/dashboard
export async function GET(req: NextRequest) {
  try {
    const cookie = req.cookies.get("token");
    if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const jwt = await verifyToken(cookie.value);
    if (jwt.role !== "PATIENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const patient = await prisma.patient.findFirst({ where: { userId: jwt.id } });
    if (!patient) return NextResponse.json({ error: "Patient profile not found" }, { status: 404 });

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

    const todayVisit = await prisma.visit.findFirst({
      where: { patientId: patient.id, visitDate: { gte: todayStart } },
      include: {
        doctor: { include: { user: { select: { name: true } } } },
        queue:  true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Queue ahead count
    let queueAhead = 0;
    let estimatedWait = 0;
    if (todayVisit?.doctorId && todayVisit.queuePosition) {
      const ahead = await prisma.queue.count({
        where: {
          doctorId: todayVisit.doctorId,
          status:   { in: ["WAITING", "ASSIGNED", "IN_CONSULTATION"] },
          queuePosition: { lt: todayVisit.queuePosition },
        },
      });
      queueAhead   = ahead;
      estimatedWait = await estimatedWaitMinutes(todayVisit.doctorId, ahead + 1);
    }

    return NextResponse.json({ patient, todayVisit, queueAhead, estimatedWait });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
