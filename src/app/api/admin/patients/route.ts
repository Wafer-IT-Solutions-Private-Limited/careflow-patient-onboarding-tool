import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get("token")?.value;
  if (!token) return null;
  try {
    const s = await verifyToken(token);
    return s.role === "ADMIN" ? s : null;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  if (!await requireAdmin(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const patients = await prisma.user.findMany({
    where:   { role: "PATIENT" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, email: true,
      isVerified: true, createdAt: true,
      patientProfile: { select: { id: true, dateOfBirth: true } },
    },
  });

  return NextResponse.json({ patients });
}
