import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// POST /api/doctor/consultation — save prescription + health notes
export async function POST(req: NextRequest) {
  try {
    const cookie = req.cookies.get("token");
    if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const jwt = await verifyToken(cookie.value);
    if (jwt.role !== "DOCTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const doctor = await prisma.doctor.findUnique({ where: { userId: jwt.id } });
    if (!doctor) return NextResponse.json({ error: "Doctor not found" }, { status: 404 });

    const { visitId, prescription, healthNotes } = await req.json();
    if (!visitId) return NextResponse.json({ error: "visitId is required" }, { status: 400 });

    const history = await prisma.patientHistory.findUnique({ where: { visitId } });
    if (!history) return NextResponse.json({ error: "Consultation record not found" }, { status: 404 });
    if (history.doctorId !== doctor.id)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const now = new Date();
    const duration = history.consultationStart
      ? Math.round((now.getTime() - history.consultationStart.getTime()) / 1000)
      : null;

    const updated = await prisma.patientHistory.update({
      where: { visitId },
      data:  { prescription, healthNotes, consultationEnd: now, duration },
    });

    await prisma.doctorConsultation.upsert({
      where:  { historyId: updated.id },
      update: {},
      create: { doctorId: doctor.id, historyId: updated.id, visitId },
    });

    await logAudit({ userId: jwt.id, userRole: "DOCTOR", action: "SAVE_CONSULTATION", entity: "PatientHistory", entityId: updated.id });
    return NextResponse.json({ history: updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
