import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { generateToken, generateVisitId } from "@/lib/counters";
import { logAudit } from "@/lib/audit";
import { emitSSE } from "@/lib/sse";
import { todayISTStart } from "@/lib/timezone";

// GET /api/patient/appointments — list upcoming appointments
export async function GET(req: NextRequest) {
  try {
    const cookie = req.cookies.get("token");
    if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const jwt = await verifyToken(cookie.value);
    if (jwt.role !== "PATIENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const patient = await prisma.patient.findFirst({ where: { userId: jwt.id } });
    if (!patient) return NextResponse.json({ error: "Patient profile not found" }, { status: 404 });

    const todayStart = todayISTStart();
    const appointments = await prisma.visit.findMany({
      where: {
        patientId: patient.id,
        status: { in: ["SCHEDULED", "WAITING", "ASSIGNED"] },
        appointmentDate: { gte: todayStart },
      },
      orderBy: { appointmentDate: "asc" },
      include: { doctor: { include: { user: { select: { name: true } } } } },
    });
    return NextResponse.json({ appointments });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// POST /api/patient/appointments — book a future appointment
export async function POST(req: NextRequest) {
  try {
    const cookie = req.cookies.get("token");
    if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const jwt = await verifyToken(cookie.value);
    if (jwt.role !== "PATIENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const patient = await prisma.patient.findFirst({ where: { userId: jwt.id } });
    if (!patient) return NextResponse.json({ error: "Patient profile not found" }, { status: 404 });

    const { appointmentDate, healthIssue } = await req.json();
    if (!appointmentDate) return NextResponse.json({ error: "appointmentDate is required" }, { status: 400 });

    const apptDate = new Date(appointmentDate);
    const todayStart = todayISTStart();
    if (apptDate < todayStart) return NextResponse.json({ error: "Appointment date cannot be in the past" }, { status: 400 });

    // Check for existing active visit/appointment on the same date
    const apptDayStart = new Date(apptDate); apptDayStart.setHours(0, 0, 0, 0);
    const apptDayEnd   = new Date(apptDate); apptDayEnd.setHours(23, 59, 59, 999);

    const conflict = await prisma.visit.findFirst({
      where: {
        patientId: patient.id,
        status: { in: ["SCHEDULED", "WAITING", "ASSIGNED", "IN_CONSULTATION"] },
        OR: [
          { visitDate:       { gte: apptDayStart, lte: apptDayEnd } },
          { appointmentDate: { gte: apptDayStart, lte: apptDayEnd } },
        ],
      },
    });
    if (conflict) return NextResponse.json({ error: "You already have an active visit or appointment on this date" }, { status: 409 });

    const visitId = await generateVisitId();
    const token   = await generateToken();

    const visit = await prisma.visit.create({
      data: {
        visitId, token,
        patientId:       patient.id,
        appointmentDate: apptDate,
        healthIssue,
        status:          "SCHEDULED",
        priority:        patient.priority ?? "NORMAL",
        queue: {
          create: { status: "SCHEDULED", queuePosition: 0 },
        },
      },
    });

    await logAudit({ userId: jwt.id, userRole: "PATIENT", action: "BOOK_APPOINTMENT", entity: "Visit", entityId: visit.id, metadata: { appointmentDate, healthIssue } });
    emitSSE({ type: "appointment:booked", room: `patient:${patient.id}` });

    return NextResponse.json({ visit }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
