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

// Thresholds for auto-flagging URGENT
function isUrgent(data: Record<string, number | null | undefined>): boolean {
  const { systolicBP, diastolicBP, spo2, pulse, temperature, bloodSugar } = data;
  if (spo2        != null && spo2 < 94)                        return true;
  if (systolicBP  != null && (systolicBP > 160 || systolicBP < 90)) return true;
  if (diastolicBP != null && diastolicBP > 100)                return true;
  if (pulse       != null && (pulse > 120 || pulse < 50))       return true;
  if (temperature != null && temperature > 39.5)               return true;
  if (bloodSugar  != null && (bloodSugar < 60 || bloodSugar > 400)) return true;
  return false;
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

    const nurseProfile = jwt.role === "NURSE"
      ? await prisma.nurse.findUnique({ where: { userId: jwt.id } })
      : null;

    const numericData = {
      systolicBP:  systolicBP  !== undefined ? (Number(systolicBP)  || null) : undefined,
      diastolicBP: diastolicBP !== undefined ? (Number(diastolicBP) || null) : undefined,
      bloodSugar:  bloodSugar  !== undefined ? (Number(bloodSugar)  || null) : undefined,
      temperature: temperature !== undefined ? (Number(temperature) || null) : undefined,
      pulse:       pulse       !== undefined ? (Number(pulse)       || null) : undefined,
      spo2:        spo2        !== undefined ? (Number(spo2)        || null) : undefined,
      weight:      weight      !== undefined ? (Number(weight)      || null) : undefined,
      height:      height      !== undefined ? (Number(height)      || null) : undefined,
      hemoglobin:  hemoglobin  !== undefined ? (Number(hemoglobin)  || null) : undefined,
      wbc:         wbc         !== undefined ? (Number(wbc)         || null) : undefined,
      platelets:   platelets   !== undefined ? (Number(platelets)   || null) : undefined,
    };

    const data = {
      nurseId: nurseProfile?.id ?? null,
      ...Object.fromEntries(Object.entries(numericData).filter(([, v]) => v !== undefined)),
      ...(urineRoutine !== undefined && { urineRoutine: urineRoutine || null }),
      ...(notes        !== undefined && { notes:        notes || null }),
      // Clear the pending request once nurse submits
      requestedBy:    null,
      requiredFields: null,
    };

    const vitals = await prisma.vitals.upsert({
      where:  { visitId },
      update: data,
      create: { visitId, ...data },
    });

    // Auto-flag urgent based on thresholds
    const urgencyCheck = {
      systolicBP:  numericData.systolicBP  ?? null,
      diastolicBP: numericData.diastolicBP ?? null,
      spo2:        numericData.spo2        ?? null,
      pulse:       numericData.pulse       ?? null,
      temperature: numericData.temperature ?? null,
      bloodSugar:  numericData.bloodSugar  ?? null,
    };
    if (isUrgent(urgencyCheck) && visit.priority === "NORMAL") {
      await prisma.visit.update({ where: { id: visitId }, data: { priority: "URGENT" } });
    }

    if (visit.doctorId) {
      emitSSE({ type: "vitals:updated", room: `doctor:${visit.doctorId}`, visitId });
    }
    emitSSE({ type: "queue:updated", room: "nurse" });

    await logAudit({ userId: jwt.id, userRole: jwt.role, action: "RECORD_VITALS", entity: "Vitals", entityId: vitals.id, metadata: { visitId } });

    return NextResponse.json({ vitals });
  } catch (e) {
    const msg = process.env.NODE_ENV === "production" ? "Internal server error" : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
