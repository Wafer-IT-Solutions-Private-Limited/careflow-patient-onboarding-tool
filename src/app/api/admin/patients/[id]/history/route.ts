import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

// GET /api/admin/patients/[id]/history — full visit history for a patient
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const cookie = req.cookies.get("token");
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const jwt = await verifyToken(cookie.value).catch(() => null);
  if (!jwt || jwt.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const visits = await prisma.visit.findMany({
    where: { patientId: id },
    orderBy: { visitDate: "desc" },
    include: {
      doctor: { include: { user: { select: { name: true } } } },
      history: { select: { healthNotes: true, prescription: true, consultationStart: true, consultationEnd: true } },
    },
  });

  const history = visits.map(v => ({
    id:           v.id,
    visitDate:    v.visitDate,
    token:        v.token,
    status:       v.status,
    cancelReason: v.cancelReason,
    doctor:       v.doctor,
    consultation: v.history,
  }));

  return NextResponse.json({ history });
}
