import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

// GET /api/doctor/patient-history?patientId=xxx
export async function GET(req: NextRequest) {
  try {
    const cookie = req.cookies.get("token");
    if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const jwt = await verifyToken(cookie.value);
    if (jwt.role !== "DOCTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const patientId = req.nextUrl.searchParams.get("patientId");
    if (!patientId) return NextResponse.json({ error: "patientId is required" }, { status: 400 });

    const histories = await prisma.patientHistory.findMany({
      where: { patientId },
      include: {
        doctor: { include: { user: { select: { name: true } } } },
        visit:  { select: { token: true, visitId: true, visitDate: true } },
      },
      orderBy: { consultationStart: "desc" },
    });

    const patient = await prisma.patient.findUnique({
      where:  { id: patientId },
      select: { prn: true, name: true, gender: true, dateOfBirth: true, phone: true },
    });

    return NextResponse.json({ histories, patient });
  } catch (e) {
    const msg = process.env.NODE_ENV === "production" ? "Internal server error" : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

