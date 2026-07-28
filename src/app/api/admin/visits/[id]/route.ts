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

// PATCH /api/admin/visits/[id] — cancel a visit (mandatory closure note)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const jwt = await getAdmin(req);
  if (!jwt) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { reason } = await req.json();

  if (!reason?.trim()) {
    return NextResponse.json({ error: "A closure note is required to cancel a visit" }, { status: 400 });
  }

  const visit = await prisma.visit.findUnique({ where: { id }, include: { patient: true, doctor: true } });
  if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });

  if (["COMPLETED", "CANCELLED", "NO_SHOW"].includes(visit.status)) {
    return NextResponse.json({ error: `Visit is already ${visit.status.toLowerCase()}` }, { status: 400 });
  }

  const cancelNote = reason.trim();

  await prisma.$transaction([
    prisma.visit.update({ where: { id }, data: { status: "CANCELLED", cancelReason: cancelNote } }),
    prisma.queue.updateMany({ where: { visitId: id }, data: { status: "CANCELLED" } }),
  ]);

  if (visit.status === "IN_CONSULTATION" && visit.doctorId) {
    await prisma.doctor.update({ where: { id: visit.doctorId }, data: { availability: "AVAILABLE" } });
    emitSSE({ type: "doctor:status", room: "admin", doctorId: visit.doctorId, availability: "AVAILABLE" });
  }

  await logAudit({ userId: jwt.id, userRole: "ADMIN", action: "CANCEL", entity: "Visit", entityId: id, metadata: { reason: cancelNote, patientId: visit.patientId } });

  emitSSE({ type: "visit:cancelled", room: "admin",                              visitId: id, cancelReason: cancelNote });
  if (visit.doctorId) emitSSE({ type: "visit:cancelled", room: `doctor:${visit.doctorId}`, visitId: id, cancelReason: cancelNote });
  emitSSE({ type: "visit:cancelled", room: `patient:${visit.patientId}`,         visitId: id, cancelReason: cancelNote });

  return NextResponse.json({ success: true });
}
