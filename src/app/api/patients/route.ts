import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generatePRN } from "@/lib/counters";
import { logAudit } from "@/lib/audit";
import { verifyToken } from "@/lib/auth";
import { emitSSE } from "@/lib/sse";
import { createHash } from "crypto";

function hashAadhaar(raw: string): string {
  return createHash("sha256").update(raw.replace(/\s/g, "")).digest("hex");
}

// POST /api/patients — create walk-in patient (no User account; reception/admin only)
export async function POST(req: NextRequest) {
  try {
    const cookie = req.cookies.get("token");
    if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const jwt = await verifyToken(cookie.value);
    if (jwt.role !== "ADMIN" && jwt.role !== "DOCTOR")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { name, dateOfBirth, gender, phone, address, city, state, pincode, healthIssues, paymentType, priority, aadhaar } = body;

    if (!name?.trim()) return NextResponse.json({ error: "Patient name is required" }, { status: 400 });

    // Aadhaar: validate + check uniqueness
    let aadhaarHash: string | undefined;
    if (aadhaar) {
      const digits = aadhaar.replace(/\s/g, "");
      if (!/^\d{12}$/.test(digits)) return NextResponse.json({ error: "Aadhaar must be 12 digits" }, { status: 400 });
      aadhaarHash = hashAadhaar(digits);
      const existing = await prisma.patient.findFirst({ where: { aadhaarHash } });
      if (existing) return NextResponse.json({ error: "A patient with this Aadhaar already exists", patient: existing }, { status: 409 });
    }

    const prn = await generatePRN();
    const patient = await prisma.patient.create({
      data: {
        prn, name: name.trim(),
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        gender, phone, address, city, state, pincode, healthIssues, paymentType,
        priority: priority ?? "NORMAL",
        aadhaarHash,
        healthSetupComplete: true, // walk-in patients skip health setup flow
      },
    });

    await logAudit({ userId: jwt.id, userRole: jwt.role, action: "CREATE", entity: "Patient", entityId: patient.id, metadata: { prn } });
    emitSSE({ type: "patient:registered", room: "admin", prn });
    return NextResponse.json({ patient }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
