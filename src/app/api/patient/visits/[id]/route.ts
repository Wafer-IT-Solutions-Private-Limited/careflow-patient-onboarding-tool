import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { emitSSE } from "@/lib/sse";

// PATCH /api/patient/visits/[id] — patient self-cancels a visit or appointment
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const cookie = req.cookies.get("token");
    if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const jwt = await verifyToken(cookie.value);
    if (jwt.role !== "PATIENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;

    const patient = await prisma.patient.findFirst({ where: { userId: jwt.id } });
    if (!patient) return NextResponse.json({ error: "Patient profile not found" }, { status: 404 });

    const visit = await prisma.visit.findUnique({ where: { id } });
    if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
    // IDOR guard — ensure the visit belongs to this patient
    if (visit.patientId !== patient.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const cancellable = ["WAITING", "ASSIGNED", "SCHEDULED"];
    if (!cancellable.includes(visit.status)) {
      return NextResponse.json({ error: "This visit cannot be cancelled" }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.visit.update({ where: { id }, data: { status: "CANCELLED", cancelReason: "Cancelled by patient" } }),
      prisma.queue.updateMany({ where: { visitId: id }, data: { status: "CANCELLED" } }),
    ]);

    await logAudit({ userId: jwt.id, userRole: "PATIENT", action: "CANCEL_VISIT", entity: "Visit", entityId: id });
    emitSSE({ type: "visit:cancelled", room: `patient:${patient.id}` });
    emitSSE({ type: "queue:updated", room: "admin" });
    if (visit.doctorId) {
      emitSSE({ type: "queue:updated", room: `doctor:${visit.doctorId}` });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = process.env.NODE_ENV === "production" ? "Internal server error" : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
