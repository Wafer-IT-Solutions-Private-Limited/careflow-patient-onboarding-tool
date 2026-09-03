import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

// GET /api/doctor/patient-reports?patientId=X
// Returns reports only if the patient is currently IN_CONSULTATION with this doctor
export async function GET(req: NextRequest) {
  try {
    const cookie = req.cookies.get("token");
    if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const jwt = await verifyToken(cookie.value);
    if (jwt.role !== "DOCTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const patientId = searchParams.get("patientId");
    if (!patientId) return NextResponse.json({ error: "patientId is required" }, { status: 400 });

    const doctor = await prisma.doctor.findUnique({ where: { userId: jwt.id } });
    if (!doctor) return NextResponse.json({ error: "Doctor not found" }, { status: 404 });

    // Enforce: patient must be IN_CONSULTATION with this specific doctor right now
    const activeVisit = await prisma.visit.findFirst({
      where: { patientId, doctorId: doctor.id, status: "IN_CONSULTATION" },
    });
    if (!activeVisit)
      return NextResponse.json({ error: "Patient is not currently in consultation with you" }, { status: 403 });

    const reports = await prisma.patientReport.findMany({
      where: { patientId },
      select: { id: true, name: true, mimeType: true, fileSize: true, extractedText: true, ocrUsed: true, uploadedAt: true },
      orderBy: { uploadedAt: "desc" },
    });

    return NextResponse.json({ reports });
  } catch (e) {
    const msg = process.env.NODE_ENV === "production" ? "Internal server error" : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
