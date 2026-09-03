import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

async function requirePatient(req: NextRequest) {
  const token = req.cookies.get("token")?.value;
  if (!token) return null;
  try {
    const s = await verifyToken(token);
    return s.role === "PATIENT" ? s : null;
  } catch { return null; }
}

// GET /api/patient/reports — list own reports (no fileData)
export async function GET(req: NextRequest) {
  const jwt = await requirePatient(req);
  if (!jwt) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const patient = await prisma.patient.findFirst({ where: { userId: jwt.id } });
  if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  const reports = await prisma.patientReport.findMany({
    where: { patientId: patient.id },
    select: { id: true, name: true, mimeType: true, fileSize: true, extractedText: true, ocrUsed: true, uploadedAt: true },
    orderBy: { uploadedAt: "desc" },
  });

  return NextResponse.json({ reports });
}

// POST /api/patient/reports — upload a report
export async function POST(req: NextRequest) {
  const jwt = await requirePatient(req);
  if (!jwt) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const patient = await prisma.patient.findFirst({ where: { userId: jwt.id } });
  if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  try {
    const body = await req.json();
    const { name, mimeType, fileData, extractedText, ocrUsed, fileSize } = body;

    if (!name || !mimeType || !fileData)
      return NextResponse.json({ error: "name, mimeType and fileData are required" }, { status: 400 });

    const ALLOWED = ["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!ALLOWED.includes(mimeType))
      return NextResponse.json({ error: "Only PDF and image files are supported" }, { status: 400 });

    const estimatedBytes = Math.ceil((fileData.length * 3) / 4);
    if (estimatedBytes > MAX_FILE_BYTES)
      return NextResponse.json({ error: "File exceeds 5 MB limit" }, { status: 413 });

    const report = await prisma.patientReport.create({
      data: {
        patientId:     patient.id,
        name:          String(name).slice(0, 255),
        mimeType,
        fileData,
        extractedText: extractedText ?? null,
        ocrUsed:       ocrUsed === true,
        fileSize:      Number(fileSize) || estimatedBytes,
      },
      select: { id: true, name: true, mimeType: true, fileSize: true, extractedText: true, ocrUsed: true, uploadedAt: true },
    });

    return NextResponse.json({ report }, { status: 201 });
  } catch (e) {
    const msg = process.env.NODE_ENV === "production" ? "Internal server error" : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
