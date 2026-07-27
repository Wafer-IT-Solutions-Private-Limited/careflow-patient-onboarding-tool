import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

// GET /api/patient/history
export async function GET(req: NextRequest) {
  try {
    const cookie = req.cookies.get("token");
    if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const jwt = await verifyToken(cookie.value);
    if (jwt.role !== "PATIENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const patient = await prisma.patient.findFirst({ where: { userId: jwt.id } });
    if (!patient) return NextResponse.json({ error: "Patient profile not found" }, { status: 404 });

    const histories = await prisma.patientHistory.findMany({
      where: { patientId: patient.id },
      include: {
        doctor: { include: { user: { select: { name: true } } } },
        visit:  { select: { token: true, visitId: true, visitDate: true } },
      },
      orderBy: { consultationStart: "desc" },
    });

    return NextResponse.json({ histories });
  } catch (e) {
    const msg = process.env.NODE_ENV === "production" ? "Internal server error" : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

