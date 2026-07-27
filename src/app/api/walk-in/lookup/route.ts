import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { createHash } from "crypto";

function hashAadhaar(raw: string): string {
  return createHash("sha256").update(raw.replace(/\s/g, "")).digest("hex");
}

// GET /api/walk-in/lookup?prn=...  OR  ?aadhaar=...
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("token");
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const jwt = await verifyToken(cookie.value).catch(() => null);
  if (!jwt || !["ADMIN", "DOCTOR"].includes(jwt.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const prn     = searchParams.get("prn");
  const aadhaar = searchParams.get("aadhaar");

  if (!prn && !aadhaar)
    return NextResponse.json({ error: "Provide prn or aadhaar" }, { status: 400 });

  const where = prn
    ? { prn: prn.trim().toUpperCase() }
    : { aadhaarHash: hashAadhaar(aadhaar!) };

  const patient = await prisma.patient.findFirst({
    where,
    include: {
      visits: {
        orderBy: { visitDate: "desc" },
        take: 3,
        select: { id: true, token: true, status: true, visitDate: true, visitId: true },
      },
    },
  });

  if (!patient) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ patient });
}
