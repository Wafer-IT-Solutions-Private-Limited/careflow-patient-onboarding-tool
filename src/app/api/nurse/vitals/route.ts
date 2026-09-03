import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { emitSSE } from "@/lib/sse";
import { logAudit } from "@/lib/audit";

async function requireNurse(req: NextRequest) {
  const token = req.cookies.get("token")?.value;
  if (!token) return null;
  try {
    const s = await verifyToken(token);
    return s.role === "NURSE" || s.role === "ADMIN" ? s : null;
  } catch { return null; }
}

// POST /api/nurse/vitals — create or update vitals for a visit
export async function POST(req: NextRequest) {
  const jwt = await requireNurse(req);
  if (!jwt) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { visitId, systolicBP, diastolicBP, bloodSugar, temperature, pulse,
            spo2, weight, height, hemoglobin, wbc, platelets, urineRoutine, notes } = body;

    if (!visitId) return NextResponse.json({ error: "visitId is required" }, { status: 400 });

    const visit = await prisma.visit.findUnique({
      where: { id: visitId },
      include: { doctor: true },
    });
    if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
    if (visit.status === "COMPLETED" || visit.status === "CANCELLED")
      return NextResponse.json({ error: "Cannot record vitals for a completed or cancelled visit" }, { status: 400 });

    // Find nurse profile (null for admin recording)
    const nurseProfile = jwt.role === "NURSE"
      ? await prisma.nurse.findUnique({ where: { userId: jwt.id } })
      : null;

    const data = {
      nurseId:      nurseProfile?.id ?? null,
      ...(systolicBP   !== undefined && { systolicBP:   Number(systolicBP) || null }),
      ...(diastolicBP  !== undefined && { diastolicBP:  Number(diastolicBP) || null }),
      ...(bloodSugar   !== undefined && { bloodSugar:   Number(bloodSugar) || null }),
      ...(temperature  !== undefined && { temperature:  Number(temperature) || null }),
      ...(pulse        !== undefined && { pulse:        Number(pulse) || null }),
      ...(spo2         !== undefined && { spo2:         Number(spo2) || null }),
      ...(weight       !== undefined && { weight:       Number(weight) || null }),
      ...(height       !== undefined && { height:       Number(height) || null }),
      ...(hemoglobin   !== undefined && { hemoglobin:   Number(hemoglobin) || null }),
      ...(wbc          !== undefined && { wbc:          Number(wbc) || null }),
      ...(platelets    !== undefined && { platelets:    Number(platelets) || null }),
      ...(urineRoutine !== undefined && { urineRoutine: urineRoutine || null }),
      ...(notes        !== undefined && { notes:        notes || null }),
    };

    const vitals = await prisma.vitals.upsert({
      where:  { visitId },
      update: data,
      create: { visitId, ...data },
    });

    // Notify the assigned doctor in real-time
    if (visit.doctorId) {
      emitSSE({ type: "vitals:updated", room: `doctor:${visit.doctorId}`, visitId });
    }

    await logAudit({ userId: jwt.id, userRole: jwt.role, action: "RECORD_VITALS", entity: "Vitals", entityId: vitals.id, metadata: { visitId } });

    return NextResponse.json({ vitals });
  } catch (e) {
    const msg = process.env.NODE_ENV === "production" ? "Internal server error" : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
