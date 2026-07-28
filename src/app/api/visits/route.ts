import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateToken, generateVisitId } from "@/lib/counters";
import { assignDoctor, getQueuePosition } from "@/lib/queue";
import { logAudit } from "@/lib/audit";
import { verifyToken } from "@/lib/auth";
import { todayISTStart } from "@/lib/timezone";

// POST /api/visits â€” create a new visit (walk-in or revisit); ADMIN and DOCTOR only
export async function POST(req: NextRequest) {
  try {
    const cookie = req.cookies.get("token");
    if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const jwt = await verifyToken(cookie.value);
    if (!["ADMIN", "DOCTOR"].includes(jwt.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { patientId, priority, paymentType } = await req.json();
    if (!patientId) return NextResponse.json({ error: "patientId is required" }, { status: 400 });

    const patient = await prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

    // Check if patient already has an active visit today (IST)
    const todayStart = todayISTStart();
    const existing = await prisma.visit.findFirst({
      where: {
        patientId,
        visitDate: { gte: todayStart },
        status: { in: ["WAITING", "ASSIGNED", "IN_CONSULTATION"] },
      },
    });
    if (existing) {
      return NextResponse.json({ error: "Patient already has an active visit today", visit: existing }, { status: 409 });
    }

    const doctorId = await assignDoctor();
    const visitId  = await generateVisitId();
    const token    = await generateToken();
    const queuePos = doctorId ? await getQueuePosition(doctorId) : null;

    const visit = await prisma.visit.create({
      data: {
        visitId, token, patientId,
        doctorId: doctorId ?? undefined,
        status: doctorId ? "ASSIGNED" : "WAITING",
        queuePosition: queuePos,
        priority: priority ?? patient.priority ?? "NORMAL",
        paymentType: paymentType ?? null,
        queue: {
          create: {
            doctorId: doctorId ?? undefined,
            status: doctorId ? "ASSIGNED" : "WAITING",
            queuePosition: queuePos ?? 0,
          },
        },
      },
      include: { patient: true, doctor: { include: { user: true } }, queue: true },
    });

    if (doctorId) {
      await prisma.doctor.update({
        where: { id: doctorId },
        data:  { lastAssignedAt: new Date() },
      });
    }

    await logAudit({ userId: jwt.id, userRole: jwt.role, action: "CREATE", entity: "Visit", entityId: visit.id, metadata: { visitId, token, doctorId } });
    return NextResponse.json({ visit }, { status: 201 });
  } catch (e) {
    const msg = process.env.NODE_ENV === "production" ? "Internal server error" : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

