import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("token");
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const jwt = await verifyToken(cookie.value).catch(() => null);
  if (!jwt || jwt.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status  = searchParams.get("status") || "";
  const search  = searchParams.get("search") || "";
  const dateFrom = searchParams.get("from") || "";
  const dateTo   = searchParams.get("to")   || "";

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (dateFrom || dateTo) {
    where.visitDate = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo   ? { lte: new Date(dateTo + "T23:59:59.999Z") } : {}),
    };
  }

  const visits = await prisma.visit.findMany({
    where,
    orderBy: { visitDate: "desc" },
    take: 200,
    include: {
      patient: { select: { prn: true, name: true, phone: true } },
      doctor:  { include: { user: { select: { name: true } } } },
    },
  });

  const filtered = search
    ? visits.filter(v =>
        v.patient.name.toLowerCase().includes(search.toLowerCase()) ||
        v.patient.prn.toLowerCase().includes(search.toLowerCase()) ||
        v.token.toLowerCase().includes(search.toLowerCase())
      )
    : visits;

  return NextResponse.json({ visits: filtered });
}
