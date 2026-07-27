import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { emitSSE } from "@/lib/sse";

// POST /api/doctor/next-patient â€” complete current consultation and pull next patient
export async function POST(req: NextRequest) {
  try {
    const cookie = req.cookies.get("token");
    if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const jwt = await verifyToken(cookie.value);
    if (jwt.role !== "DOCTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const doctor = await prisma.doctor.findUnique({ where: { userId: jwt.id } });
    if (!doctor) return NextResponse.json({ error: "Doctor not found" }, { status: 404 });

    // Complete any current IN_CONSULTATION visit
    const current = await prisma.visit.findFirst({
      where: { doctorId: doctor.id, status: "IN_CONSULTATION" },
    });
    if (current) {
      await prisma.visit.update({ where: { id: current.id }, data: { status: "COMPLETED" } });
      await prisma.queue.updateMany({ where: { visitId: current.id }, data: { status: "COMPLETED" } });
      await logAudit({ userId: jwt.id, userRole: "DOCTOR", action: "COMPLETE", entity: "Visit", entityId: current.id });
    }

    // Pull next ASSIGNED patient
    const next = await prisma.visit.findFirst({
      where: { doctorId: doctor.id, status: "ASSIGNED" },
      orderBy: { queuePosition: "asc" },
      include: { patient: true },
    });

    if (next) {
      const now = new Date();
      await prisma.visit.update({ where: { id: next.id }, data: { status: "IN_CONSULTATION" } });
      await prisma.queue.updateMany({ where: { visitId: next.id }, data: { status: "IN_CONSULTATION" } });
      await prisma.patientHistory.create({
        data: {
          visitId:           next.id,
          patientId:         next.patientId,
          doctorId:          doctor.id,
          consultationStart: now,
        },
      });
      // Mark doctor engaged while in consultation
      await prisma.doctor.update({ where: { id: doctor.id }, data: { availability: "ENGAGED" } });
      await logAudit({ userId: jwt.id, userRole: "DOCTOR", action: "START_CONSULTATION", entity: "Visit", entityId: next.id });
      emitSSE({ type: "patient:called", room: `doctor:${doctor.id}`, token: next.token });
      emitSSE({ type: "patient:called", room: `patient:${next.patientId}`, token: next.token });
      emitSSE({ type: "queue:updated", room: "admin" });
      return NextResponse.json({ message: "Next patient started", visit: next });
    }

    // Queue empty â€” set doctor back to AVAILABLE
    await prisma.doctor.update({ where: { id: doctor.id }, data: { availability: "AVAILABLE" } });
    emitSSE({ type: "doctor:status", room: "admin", doctorId: doctor.id, availability: "AVAILABLE" });
    return NextResponse.json({ message: "No more patients in queue", visit: null });
  } catch (e) {
    const msg = process.env.NODE_ENV === "production" ? "Internal server error" : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

