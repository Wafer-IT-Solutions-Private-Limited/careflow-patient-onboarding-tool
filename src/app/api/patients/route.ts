import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { generatePRN } from "@/lib/counters";
import { logAudit } from "@/lib/audit";
import { verifyToken } from "@/lib/auth";
import { emitSSE } from "@/lib/sse";

function hashAadhaar(raw: string) {
  return createHash("sha256").update(raw.replace(/\s/g, "")).digest("hex");
}

function generateTempPassword(): string {
  return randomBytes(5).toString("hex"); // 10 hex chars, cryptographically random
}

// POST /api/patients — create walk-in patient with User account; ADMIN only
export async function POST(req: NextRequest) {
  try {
    const cookie = req.cookies.get("token");
    if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const jwt = await verifyToken(cookie.value);
    if (jwt.role !== "ADMIN" && jwt.role !== "DOCTOR")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { name, dateOfBirth, gender, phone, address, city, state, pincode, healthIssues, priority, aadhaar, consentGiven } = body;

    // Mandatory field validation
    if (!name?.trim())        return NextResponse.json({ error: "Patient name is required" }, { status: 400 });
    if (!phone?.trim())       return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
    if (!dateOfBirth?.trim()) return NextResponse.json({ error: "Date of birth is required" }, { status: 400 });
    if (!gender?.trim())      return NextResponse.json({ error: "Gender is required" }, { status: 400 });
    if (!aadhaar?.trim())     return NextResponse.json({ error: "Aadhaar number is required" }, { status: 400 });

    // Phone uniqueness
    const existingPhone = await prisma.patient.findFirst({ where: { phone: phone.trim() } });
    if (existingPhone) return NextResponse.json({ error: "A patient with this phone number already exists", patient: existingPhone }, { status: 409 });

    // Aadhaar validation + uniqueness
    const digits = aadhaar.replace(/\s/g, "");
    if (!/^\d{12}$/.test(digits)) return NextResponse.json({ error: "Aadhaar must be 12 digits" }, { status: 400 });
    const aadhaarHash = hashAadhaar(digits);
    const existingAadhaar = await prisma.patient.findFirst({ where: { aadhaarHash } });
    if (existingAadhaar) return NextResponse.json({ error: "A patient with this Aadhaar already exists", patient: existingAadhaar }, { status: 409 });

    const prn      = await generatePRN();
    const rawPwd   = generateTempPassword();
    const pwdHash  = await bcrypt.hash(rawPwd, 12);

    // Create User + Patient in a transaction
    const user = await prisma.user.create({
      data: {
        name:              name.trim(),
        email:             null,
        password:          pwdHash,
        role:              "PATIENT",
        isVerified:        true,
        mustChangePassword: true,
        patientProfile: {
          create: {
            prn,
            name:               name.trim(),
            dateOfBirth:        new Date(dateOfBirth),
            gender,
            phone:              phone.trim(),
            address,
            city,
            state,
            pincode,
            healthIssues,
            priority:           priority ?? "NORMAL",
            aadhaarHash,
            healthSetupComplete: false,
            dataConsentGiven: !!consentGiven,
            dataConsentAt: consentGiven ? new Date() : undefined,
          },
        },
      },
      include: { patientProfile: true },
    });

    const patient = user.patientProfile!;

    await logAudit({ userId: jwt.id, userRole: jwt.role, action: "CREATE", entity: "Patient", entityId: patient.id, metadata: { prn } });
    emitSSE({ type: "patient:registered", room: "admin", prn });

    return NextResponse.json({ patient, tempPassword: rawPwd }, { status: 201 });
  } catch (e) {
    const msg = process.env.NODE_ENV === "production" ? "Internal server error" : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
