import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generatePRN } from "@/lib/counters";
import { logAudit } from "@/lib/audit";
import { verifyToken } from "@/lib/auth";

// POST /api/patients — create walk-in patient (reception/admin)
export async function POST(req: NextRequest) {
  try {
    const cookie = req.cookies.get("token");
    if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const jwt = await verifyToken(cookie.value);
    if (jwt.role !== "ADMIN" && jwt.role !== "DOCTOR")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { name, dateOfBirth, gender, phone, address, city, state, pincode, healthIssues, paymentType, priority } = body;

    if (!name?.trim()) return NextResponse.json({ error: "Patient name is required" }, { status: 400 });

    const prn = await generatePRN();
    const patient = await prisma.patient.create({
      data: {
        prn, name: name.trim(),
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        gender, phone, address, city, state, pincode, healthIssues, paymentType,
        priority: priority ?? "NORMAL",
      },
    });

    await logAudit({ userId: jwt.id, userRole: jwt.role, action: "CREATE", entity: "Patient", entityId: patient.id, metadata: { prn } });
    return NextResponse.json({ patient }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
