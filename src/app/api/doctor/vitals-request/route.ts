import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { emitSSE } from "@/lib/sse";

// POST /api/doctor/vitals-request — doctor requests additional vitals from nurse
export async function POST(req: NextRequest) {
  try {
    const cookie = req.cookies.get("token");
    if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const jwt = await verifyToken(cookie.value);
    if (jwt.role !== "DOCTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { visitId } = await req.json();
    if (!visitId) return NextResponse.json({ error: "visitId is required" }, { status: 400 });

    const visit = await prisma.visit.findUnique({
      where: { id: visitId },
      include: { patient: { select: { name: true } }, doctor: true },
    });
    if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });

    // Guard: only the assigned doctor can request
    const doctor = await prisma.doctor.findUnique({ where: { userId: jwt.id } });
    if (!doctor || visit.doctorId !== doctor.id)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Mark on vitals record that doctor has requested an update
    await prisma.vitals.upsert({
      where:  { visitId },
      update: { requestedBy: jwt.id },
      create: { visitId, requestedBy: jwt.id },
    });

    emitSSE({
      type: "vitals:requested",
      room: "nurse",
      visitId,
      doctorId: doctor.id,
      patientName: visit.patient.name,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = process.env.NODE_ENV === "production" ? "Internal server error" : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
