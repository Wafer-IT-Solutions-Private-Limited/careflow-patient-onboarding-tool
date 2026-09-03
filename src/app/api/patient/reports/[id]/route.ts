import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

async function requirePatient(req: NextRequest) {
  const token = req.cookies.get("token")?.value;
  if (!token) return null;
  try {
    const s = await verifyToken(token);
    return s.role === "PATIENT" ? s : null;
  } catch { return null; }
}

// DELETE /api/patient/reports/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const jwt = await requirePatient(req);
  if (!jwt) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const patient = await prisma.patient.findFirst({ where: { userId: jwt.id } });
  if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  const report = await prisma.patientReport.findUnique({ where: { id } });
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  if (report.patientId !== patient.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.patientReport.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
