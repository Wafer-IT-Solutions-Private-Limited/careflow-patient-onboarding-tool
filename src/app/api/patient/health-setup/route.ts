import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { createHash } from "crypto";

function hashAadhaar(aadhaar: string): string {
  return createHash("sha256").update(aadhaar.trim()).digest("hex");
}

// GET /api/patient/health-setup — returns whether Aadhaar is already on file
export async function GET(req: NextRequest) {
  try {
    const cookie = req.cookies.get("token");
    if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const jwt = await verifyToken(cookie.value);
    if (jwt.role !== "PATIENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const patient = await prisma.patient.findFirst({
      where: { userId: jwt.id },
      select: { aadhaarHash: true },
    });
    if (!patient) return NextResponse.json({ error: "Patient profile not found" }, { status: 404 });

    return NextResponse.json({ hasAadhaar: !!patient.aadhaarHash });
  } catch (e) {
    const msg = process.env.NODE_ENV === "production" ? "Internal server error" : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/patient/health-setup
export async function POST(req: NextRequest) {
  try {
    const cookie = req.cookies.get("token");
    if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const jwt = await verifyToken(cookie.value);
    if (jwt.role !== "PATIENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const patient = await prisma.patient.findFirst({ where: { userId: jwt.id } });
    if (!patient) return NextResponse.json({ error: "Patient profile not found" }, { status: 404 });

    const { aadhaar, bloodGroup, allergies, chronicConditions, emergencyContact, emergencyPhone } = await req.json();

    // All fields are mandatory (values like "None" / "NA" are acceptable)
    if (!bloodGroup?.trim())        return NextResponse.json({ error: "Blood group is required" }, { status: 400 });
    if (!allergies?.trim())         return NextResponse.json({ error: "Allergies field is required (enter None if none)" }, { status: 400 });
    if (!chronicConditions?.trim()) return NextResponse.json({ error: "Chronic conditions field is required (enter None if none)" }, { status: 400 });
    if (!emergencyContact?.trim())  return NextResponse.json({ error: "Emergency contact name is required" }, { status: 400 });
    if (!emergencyPhone?.trim())    return NextResponse.json({ error: "Emergency contact phone is required" }, { status: 400 });

    const healthParts = [
      `Blood Group: ${bloodGroup.trim()}`,
      `Allergies: ${allergies.trim()}`,
      `Chronic Conditions: ${chronicConditions.trim()}`,
      `Emergency Contact: ${emergencyContact.trim()} (${emergencyPhone.trim()})`,
    ];

    const updateData: Record<string, unknown> = {
      healthSetupComplete: true,
      healthIssues: healthParts.join(" | "),
    };

    // Handle Aadhaar â€” validate 12 digits, check uniqueness via hash
    if (aadhaar) {
      const digits = aadhaar.replace(/\s/g, "");
      if (!/^\d{12}$/.test(digits)) {
        return NextResponse.json({ error: "Aadhaar must be exactly 12 digits" }, { status: 400 });
      }
      const hash = hashAadhaar(digits);
      const existing = await prisma.patient.findFirst({ where: { aadhaarHash: hash } });
      if (existing && existing.id !== patient.id) {
        return NextResponse.json({ error: "This Aadhaar is already linked to another patient" }, { status: 409 });
      }
      updateData.aadhaarHash = hash;
    }

    await prisma.patient.update({ where: { id: patient.id }, data: updateData });
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = process.env.NODE_ENV === "production" ? "Internal server error" : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

