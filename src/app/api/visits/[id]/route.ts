import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const cookie = req.cookies.get("token");
    if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const jwt = await verifyToken(cookie.value);
    // Only ADMIN and DOCTOR may fetch arbitrary visit records
    if (jwt.role !== "ADMIN" && jwt.role !== "DOCTOR")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const visit = await prisma.visit.findUnique({
      where: { id },
      include: {
        patient: true,
        doctor:  { include: { user: { select: { name: true } } } },
        queue:   true,
        history: true,
      },
    });
    if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
    return NextResponse.json({ visit });
  } catch (e) {
    const msg = process.env.NODE_ENV === "production" ? "Internal server error" : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const cookie = req.cookies.get("token");
    if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const jwt = await verifyToken(cookie.value);
    if (jwt.role !== "ADMIN" && jwt.role !== "DOCTOR")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    // Whitelist only safe, updatable fields — prevents mass assignment
    const { status, priority, cancelReason } = body;
    const visit = await prisma.visit.update({
      where: { id },
      data:  {
        ...(status       !== undefined && { status }),
        ...(priority     !== undefined && { priority }),
        ...(cancelReason !== undefined && { cancelReason }),
      },
    });
    return NextResponse.json({ visit });
  } catch (e) {
    const msg = process.env.NODE_ENV === "production" ? "Internal server error" : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
