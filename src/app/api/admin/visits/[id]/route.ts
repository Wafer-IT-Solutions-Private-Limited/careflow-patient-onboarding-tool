import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { emitSSE } from "@/lib/sse";

async function getAdmin(req: NextRequest) {
  const cookie = req.cookies.get("token");
  if (!cookie) return null;
  const jwt = await verifyToken(cookie.value).catch(() => null);
  if (!jwt || jwt.role !== "ADMIN") return null;
  return jwt;
}

// PATCH /api/admin/visits/[id] — cancel a visit
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const jwt = await getAdmin(req);
  if (!jwt) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { reason } = await req.json();

  const visit = await prisma.visit.findUnique({ where: { id }, include: { patient: true, doctor: true } });
  if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });

  if (["COMPLETED", "CANCELLED", "NO_SHOW"].includes(visit.status)) {
    return NextResponse.json({ error: `Visit is already ${visit.status.toLowerCase()}` }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.visit.update({
      where: { id },
      data:  { status: "CANCELLED", cancelReason: reason ?? "Cancelled by admin" },
    }),
    prisma.queue.updateMany({
      where: { visitId: id },
      data:  { status: "CANCELLED" },
    }),
  ]);

  // If patient was IN_CONSULTATION, free the doctor
  if (visit.status === "IN_CONSULTATION" && visit.doctorId) {
    await prisma.doctor.update({ where: { id: visit.doctorId }, data: { availability: "AVAILABLE" } });
    emitSSE({ type: "doctor:status", room: "admin", doctorId: visit.doctorId, availability: "AVAILABLE" });
  }

  await logAudit({
    userId: jwt.id, userRole: "ADMIN",
    action: "CANCEL", entity: "Visit", entityId: id,
    metadata: { reason, patientId: visit.patientId },
  });

  emitSSE({ type: "visit:cancelled", room: "admin", visitId: id });
  if (visit.doctorId) emitSSE({ type: "visit:cancelled", room: `doctor:${visit.doctorId}`, visitId: id });
  emitSSE({ type: "visit:cancelled", room: `patient:${visit.patientId}`, visitId: id });

  return NextResponse.json({ success: true });
}
