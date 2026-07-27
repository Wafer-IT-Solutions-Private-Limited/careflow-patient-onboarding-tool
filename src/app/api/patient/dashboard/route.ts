import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { estimatedWaitMinutes, assignDoctor, getQueuePosition } from "@/lib/queue";
import { todayISTStart } from "@/lib/timezone";
import { emitSSE } from "@/lib/sse";
import { logAudit } from "@/lib/audit";

// GET /api/patient/dashboard — also activates today's SCHEDULED appointment if present
export async function GET(req: NextRequest) {
  try {
    const cookie = req.cookies.get("token");
    if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const jwt = await verifyToken(cookie.value);
    if (jwt.role !== "PATIENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const patient = await prisma.patient.findFirst({ where: { userId: jwt.id } });
    if (!patient) return NextResponse.json({ error: "Patient profile not found" }, { status: 404 });

    const todayStart = todayISTStart();

    // Activate today's SCHEDULED appointment → WAITING
    const scheduledToday = await prisma.visit.findFirst({
      where: {
        patientId:       patient.id,
        status:          "SCHEDULED",
        appointmentDate: { gte: todayStart, lt: new Date(todayStart.getTime() + 86_400_000) },
      },
    });
    if (scheduledToday) {
      const doctorId = await assignDoctor();
      const queuePos = doctorId ? await getQueuePosition(doctorId) : null;
      await prisma.visit.update({
        where: { id: scheduledToday.id },
        data: {
          status:        doctorId ? "ASSIGNED" : "WAITING",
          doctorId:      doctorId ?? undefined,
          queuePosition: queuePos,
          visitDate:     new Date(),
        },
      });
      await prisma.queue.updateMany({
        where: { visitId: scheduledToday.id },
        data:  { status: doctorId ? "ASSIGNED" : "WAITING", doctorId: doctorId ?? undefined, queuePosition: queuePos ?? 0 },
      });
      if (doctorId) {
        await prisma.doctor.update({ where: { id: doctorId }, data: { lastAssignedAt: new Date() } });
        emitSSE({ type: "queue:updated", room: `doctor:${doctorId}` });
      }
      await logAudit({ userId: jwt.id, userRole: "PATIENT", action: "ACTIVATE_APPOINTMENT", entity: "Visit", entityId: scheduledToday.id });
      emitSSE({ type: "queue:updated", room: "admin" });
    }

    const todayVisit = await prisma.visit.findFirst({
      where: {
        patientId: patient.id,
        visitDate: { gte: todayStart },
        status:    { in: ["WAITING", "ASSIGNED", "IN_CONSULTATION"] },
      },
      include: {
        doctor: { include: { user: { select: { name: true } } } },
        queue:  true,
      },
      orderBy: { createdAt: "desc" },
    });

    let queueAhead = 0;
    let estimatedWait = 0;
    if (todayVisit?.doctorId && todayVisit.queuePosition) {
      const ahead = await prisma.queue.count({
        where: {
          doctorId:      todayVisit.doctorId,
          status:        { in: ["WAITING", "ASSIGNED", "IN_CONSULTATION"] },
          queuePosition: { lt: todayVisit.queuePosition },
        },
      });
      queueAhead    = ahead;
      estimatedWait = await estimatedWaitMinutes(todayVisit.doctorId, ahead + 1);
    }

    // Upcoming appointments (future SCHEDULED)
    const upcomingAppointments = await prisma.visit.findMany({
      where: {
        patientId: patient.id,
        status:    "SCHEDULED",
        appointmentDate: { gt: new Date(todayStart.getTime() + 86_400_000) },
      },
      orderBy: { appointmentDate: "asc" },
      take: 5,
    });

    return NextResponse.json({ patient, todayVisit, queueAhead, estimatedWait, upcomingAppointments });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
