import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

async function getAdmin(req: NextRequest) {
  const cookie = req.cookies.get("token");
  if (!cookie) return null;
  const jwt = await verifyToken(cookie.value).catch(() => null);
  if (!jwt || jwt.role !== "ADMIN") return null;
  return jwt;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const jwt = await getAdmin(req);
  if (!jwt) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const doctor = await prisma.doctor.findUnique({
    where: { id },
    include: { user: true, _count: { select: { visits: true } } },
  });
  if (!doctor) return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
  return NextResponse.json({ doctor });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const jwt = await getAdmin(req);
  if (!jwt) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { licenseNumber, specialization, approved, availability } = await req.json();
  const doctor = await prisma.doctor.update({
    where: { id },
    data:  { licenseNumber, specialization, approved, availability },
  });
  return NextResponse.json({ doctor });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const jwt = await getAdmin(req);
  if (!jwt) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const doctor = await prisma.doctor.findUnique({ where: { id } });
  if (!doctor) return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
  await prisma.user.delete({ where: { id: doctor.userId } });
  return NextResponse.json({ message: "Doctor deleted" });
}
