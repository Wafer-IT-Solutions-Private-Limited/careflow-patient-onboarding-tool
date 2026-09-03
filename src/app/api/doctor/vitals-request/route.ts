import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { emitSSE } from "@/lib/sse";

// POST /api/doctor/vitals-request — doctor requests specific vitals from nurse
export async function POST(req: NextRequest) {
  try {
    const cookie = req.cookies.get("token");
    if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const jwt = await verifyToken(cookie.value);
    if (jwt.role !== "DOCTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { visitId, requiredFields } = await req.json();
    if (!visitId) return NextResponse.json({ error: "visitId is required" }, { status: 400 });

    const visit = await prisma.visit.findUnique({
      where: { id: visitId },
      include: { patient: { select: { name: true } }, doctor: true },
    });
    if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });

    const doctor = await prisma.doctor.findUnique({ where: { userId: jwt.id } });
    if (!doctor || visit.doctorId !== doctor.id)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Validate requiredFields — must be a non-empty array of known keys
    const VALID_FIELDS = ["bp","bloodSugar","temperature","pulse","spo2","weight","height","hemoglobin","wbc","platelets","urineRoutine"];
    const fields: string[] = Array.isArray(requiredFields)
      ? requiredFields.filter((f: unknown) => typeof f === "string" && VALID_FIELDS.includes(f))
      : [];

    await prisma.vitals.upsert({
      where:  { visitId },
      update: { requestedBy: jwt.id, requiredFields: fields.length ? JSON.stringify(fields) : null },
      create: { visitId, requestedBy: jwt.id, requiredFields: fields.length ? JSON.stringify(fields) : null },
    });

    emitSSE({
      type: "vitals:requested",
      room: "nurse",
      visitId,
      doctorId: doctor.id,
      patientName: visit.patient.name,
      requiredFields: fields,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = process.env.NODE_ENV === "production" ? "Internal server error" : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
