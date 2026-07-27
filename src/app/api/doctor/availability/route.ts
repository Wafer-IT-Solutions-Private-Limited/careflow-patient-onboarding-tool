import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { getQueuePosition } from "@/lib/queue";
import { logAudit } from "@/lib/audit";
import { emitSSE } from "@/lib/sse";

// PATCH /api/doctor/availability
export async function PATCH(req: NextRequest) {
  try {
    const cookie = req.cookies.get("token");
    if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const jwt = await verifyToken(cookie.value);
    if (jwt.role !== "DOCTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { availability } = await req.json();
    if (!["AVAILABLE", "ENGAGED", "OFFLINE"].includes(availability))
      return NextResponse.json({ error: "Invalid availability value" }, { status: 400 });

    const doctor = await prisma.doctor.update({
      where: { userId: jwt.id },
      data:  { availability },
    });

    // When doctor becomes AVAILABLE, assign any globally WAITING patients
    if (availability === "AVAILABLE") {
      const waitingVisits = await prisma.visit.findMany({
        where:   { doctorId: null, status: "WAITING" },
        orderBy: { createdAt: "asc" },
      });

      for (const visit of waitingVisits) {
        const queuePos = await getQueuePosition(doctor.id);
        await prisma.visit.update({
          where: { id: visit.id },
          data:  { doctorId: doctor.id, status: "ASSIGNED", queuePosition: queuePos },
        });
        await prisma.queue.updateMany({
          where: { visitId: visit.id },
          data:  { doctorId: doctor.id, status: "ASSIGNED", queuePosition: queuePos },
        });
        await prisma.doctor.update({
          where: { id: doctor.id },
          data:  { lastAssignedAt: new Date() },
        });
        await logAudit({ userId: jwt.id, userRole: "DOCTOR", action: "AUTO_ASSIGN", entity: "Visit", entityId: visit.id, metadata: { doctorId: doctor.id } });
      }
    }

    emitSSE({ type: "doctor:status", room: "admin", doctorId: doctor.id, availability });
    if (availability === "AVAILABLE") emitSSE({ type: "queue:updated", room: "admin" });
    return NextResponse.json({ doctor, assignedWaiting: availability === "AVAILABLE" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
