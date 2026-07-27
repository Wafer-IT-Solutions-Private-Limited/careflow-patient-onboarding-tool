import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { generateToken, generateVisitId } from "@/lib/counters";
import { assignDoctor, getQueuePosition } from "@/lib/queue";
import { logAudit } from "@/lib/audit";
import { todayISTStart } from "@/lib/timezone";
import { emitSSE } from "@/lib/sse";

// POST /api/patient/join-queue â€” logged-in patient creates today's visit
export async function POST(req: NextRequest) {
  try {
    const cookie = req.cookies.get("token");
    if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const jwt = await verifyToken(cookie.value);
    if (jwt.role !== "PATIENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const patient = await prisma.patient.findFirst({ where: { userId: jwt.id } });
    if (!patient) return NextResponse.json({ error: "Patient profile not found" }, { status: 404 });

    const todayStart = todayISTStart();
    const existing = await prisma.visit.findFirst({
      where: {
        patientId: patient.id,
        visitDate: { gte: todayStart },
        status:    { in: ["WAITING", "ASSIGNED", "IN_CONSULTATION"] },
      },
    });
    if (existing) {
      return NextResponse.json({ error: "You already have an active visit today", visit: existing }, { status: 409 });
    }

    const doctorId = await assignDoctor();
    const visitId  = await generateVisitId();
    const token    = await generateToken();
    const queuePos = doctorId ? await getQueuePosition(doctorId) : null;

    const visit = await prisma.visit.create({
      data: {
        visitId, token, patientId: patient.id,
        doctorId:      doctorId ?? undefined,
        status:        doctorId ? "ASSIGNED" : "WAITING",
        queuePosition: queuePos,
        priority:      patient.priority ?? "NORMAL",
        queue: {
          create: {
            doctorId:      doctorId ?? undefined,
            status:        doctorId ? "ASSIGNED" : "WAITING",
            queuePosition: queuePos ?? 0,
          },
        },
      },
      include: { doctor: { include: { user: { select: { name: true } } } } },
    });

    if (doctorId) {
      await prisma.doctor.update({ where: { id: doctorId }, data: { lastAssignedAt: new Date() } });
    }

    await logAudit({ userId: jwt.id, userRole: "PATIENT", action: "JOIN_QUEUE", entity: "Visit", entityId: visit.id, metadata: { visitId, token } });
    emitSSE({ type: "queue:updated", room: "admin" });
    if (doctorId) emitSSE({ type: "queue:updated", room: `doctor:${doctorId}` });
    return NextResponse.json({ visit }, { status: 201 });
  } catch (e) {
    const msg = process.env.NODE_ENV === "production" ? "Internal server error" : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

