import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

// GET /api/patients/prn-lookup?prn=PAT-YYYYMMDD-XXXX
export async function GET(req: NextRequest) {
  try {
    const cookie = req.cookies.get("token");
    if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await verifyToken(cookie.value);

    const prn = req.nextUrl.searchParams.get("prn");
    if (!prn) return NextResponse.json({ error: "prn is required" }, { status: 400 });

    const patient = await prisma.patient.findUnique({
      where: { prn },
      include: {
        visits: {
          orderBy: { visitDate: "desc" },
          take: 1,
          select: { id: true, visitId: true, token: true, status: true, visitDate: true },
        },
      },
    });

    if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    return NextResponse.json({ patient });
  } catch (e) {
    const msg = process.env.NODE_ENV === "production" ? "Internal server error" : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

