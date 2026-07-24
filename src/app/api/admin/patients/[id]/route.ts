import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPatientEmail } from "@/lib/validators/auth";

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
  const { name, email, dateOfBirth, isVerified } = body;

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
        patientProfile: { select: { id: true, dateOfBirth: true } },
      },
    }),
    // Update dateOfBirth on PatientProfile if provided
    ...(dateOfBirth !== undefined
      ? [prisma.patient.updateMany({
          where: { userId: id },
          data:  { dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null },
        })]
      : []),
  ]);

  return NextResponse.json({ patient: updatedUser });
}

// DELETE /api/admin/patients/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Delete profile first (FK constraint), then user
  await prisma.$transaction([
    prisma.patient.deleteMany({ where: { userId: id } }),
    prisma.user.delete({ where: { id } }),
  ]);

  return NextResponse.json({ success: true });
}
