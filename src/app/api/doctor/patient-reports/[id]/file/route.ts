import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

// GET /api/doctor/patient-reports/[id]/file
// Serves raw file bytes — doctor must have patient IN_CONSULTATION right now
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const cookie = req.cookies.get("token");
    if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const jwt = await verifyToken(cookie.value);
    if (jwt.role !== "DOCTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;

    const doctor = await prisma.doctor.findUnique({ where: { userId: jwt.id } });
    if (!doctor) return NextResponse.json({ error: "Doctor not found" }, { status: 404 });

    const report = await prisma.patientReport.findUnique({ where: { id } });
    if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

    // Enforce: patient must be IN_CONSULTATION with this specific doctor right now
    const activeVisit = await prisma.visit.findFirst({
      where: { patientId: report.patientId, doctorId: doctor.id, status: "IN_CONSULTATION" },
    });
    if (!activeVisit)
      return NextResponse.json({ error: "Patient is not currently in consultation with you" }, { status: 403 });

    const bytes = Buffer.from(report.fileData, "base64");
    return new NextResponse(bytes, {
      headers: {
        "Content-Type":        report.mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(report.name)}"`,
        "Content-Length":      String(bytes.length),
        "Cache-Control":       "private, no-store",
      },
    });
  } catch (e) {
    const msg = process.env.NODE_ENV === "production" ? "Internal server error" : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
