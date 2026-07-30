import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPatientEmail } from "@/lib/validators/auth";
import bcrypt from "bcryptjs";

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get("token")?.value;
  if (!token) return null;
  try {
    const s = await verifyToken(token);
    return s.role === "ADMIN" ? s : null;
  } catch { return null; }
}

// GET /api/admin/patients/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where:  { id, role: "PATIENT" },
    select: {
      id: true, name: true, email: true,
      isVerified: true, createdAt: true,
      patientProfile: { select: { id: true, dateOfBirth: true } },
    },
  });

  if (!user) return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  return NextResponse.json({ patient: user });
}

// PUT /api/admin/patients/[id]
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { name, email, dateOfBirth, isVerified, gender, phone, address, city, state, pincode, healthIssues, paymentType, priority } = body;

  // Validate email stays patient domain
  if (email && !isPatientEmail(email)) {
    return NextResponse.json(
      { error: "Patient email cannot use @hospital.com domain" },
      { status: 400 },
    );
  }

  // Check email uniqueness if changed
  if (email) {
    const conflict = await prisma.user.findFirst({ where: { email, NOT: { id } } });
    if (conflict)
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const [updatedUser] = await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: {
        ...(name       !== undefined && { name }),
        ...(email      !== undefined && { email }),
        ...(isVerified !== undefined && { isVerified }),
      },
      select: {
        id: true, name: true, email: true,
        isVerified: true, createdAt: true,
        patientProfile: {
          select: {
            id: true, prn: true, dateOfBirth: true, gender: true,
            phone: true, address: true, city: true, state: true,
            pincode: true, healthIssues: true, paymentType: true, priority: true,
          },
        },
      },
    }),
    prisma.patient.updateMany({
      where: { userId: id },
      data: {
        ...(name        !== undefined && { name }),
        ...(dateOfBirth !== undefined && { dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null }),
        ...(gender      !== undefined && { gender }),
        ...(phone       !== undefined && { phone }),
        ...(address     !== undefined && { address }),
        ...(city        !== undefined && { city }),
        ...(state       !== undefined && { state }),
        ...(pincode     !== undefined && { pincode }),
        ...(healthIssues !== undefined && { healthIssues }),
        ...(paymentType !== undefined && { paymentType }),
        ...(priority    !== undefined && { priority }),
      },
    }),
  ]);

  return NextResponse.json({ patient: updatedUser });
}

// PATCH /api/admin/patients/[id] — reset password
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { password } = await req.json();
  if (!password || password.length < 6)
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });

  // Scope to PATIENT role only — prevents resetting doctor/admin passwords
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || target.role !== "PATIENT")
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  const hash = await bcrypt.hash(password, 12);
  await prisma.user.update({ where: { id }, data: { password: hash } });
  return NextResponse.json({ success: true });
}

// DELETE /api/admin/patients/[id] — soft delete: preserves visits, consultations, and audit logs
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Scope to PATIENT role only — prevents deleting doctor/admin accounts
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || target.role !== "PATIENT")
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  const patients = await prisma.patient.findMany({ where: { userId: id }, select: { id: true } });
  const patientIds = patients.map(p => p.id);

  // Remove active queue entries and cancel any in-progress visits so the queue is clean
  const activeVisits = await prisma.visit.findMany({
    where: { patientId: { in: patientIds }, status: { in: ["WAITING", "ASSIGNED", "IN_CONSULTATION"] } },
    select: { id: true },
  });
  const activeVisitIds = activeVisits.map(v => v.id);

  await prisma.$transaction([
    // Drop queue entries for active visits
    prisma.queue.deleteMany({ where: { visitId: { in: activeVisitIds } } }),
    // Mark those visits cancelled
    prisma.visit.updateMany({
      where: { id: { in: activeVisitIds } },
      data: { status: "CANCELLED", cancelReason: "Patient account removed" },
    }),
    // Soft-delete: clear identifiable PII, mark deleted; name/DOB/gender kept for medical records
    prisma.patient.updateMany({
      where: { userId: id },
      data: {
        deletedAt:   new Date(),
        phone:       null,
        aadhaarHash: null,
        address:     null,
        city:        null,
        state:       null,
        pincode:     null,
        healthIssues: null,
      },
    }),
    // Invalidate the account so the patient cannot log in
    prisma.user.update({
      where: { id },
      data: { email: null, password: "__DELETED__", isVerified: false },
    }),
  ]);

  return NextResponse.json({ success: true });
}
