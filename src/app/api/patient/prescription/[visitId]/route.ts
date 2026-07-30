import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

// GET /api/patient/prescription/[visitId]
// Returns prescription data for a patient's own visit (used by print page)
export async function GET(req: NextRequest, { params }: { params: Promise<{ visitId: string }> }) {
  try {
    const cookie = req.cookies.get("token");
    if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const jwt = await verifyToken(cookie.value);
    if (jwt.role !== "PATIENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { visitId: historyId } = await params;
    const patient = await prisma.patient.findFirst({ where: { userId: jwt.id } });
    if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

    const history = await prisma.patientHistory.findFirst({
      where: { id: historyId, patientId: patient.id },
      include: {
        doctor: { include: { user: { select: { name: true } } } },
        visit:  { select: { token: true, visitDate: true, visitId: true, paymentType: true } },
      },
    });

    if (!history) return NextResponse.json({ error: "Prescription not found" }, { status: 404 });
    if (!history.prescription) return NextResponse.json({ error: "Prescription not yet issued" }, { status: 404 });

    return NextResponse.json({ history, patient: { name: patient.name, prn: patient.prn } });
  } catch (e) {
    const msg = process.env.NODE_ENV === "production" ? "Internal server error" : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
