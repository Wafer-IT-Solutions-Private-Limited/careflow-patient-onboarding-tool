import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

// PATCH /api/doctor/availability
export async function PATCH(req: NextRequest) {
  try {
    const cookie = req.cookies.get("token");
    if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const jwt = await verifyToken(cookie.value);
    if (jwt.role !== "DOCTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { availability } = await req.json();
    if (!["AVAILABLE", "ENGAGED", "OFFLINE"].includes(availability))
      return NextResponse.json({ error: "Invalid availability value" }, { status: 400 });

    const doctor = await prisma.doctor.update({
      where: { userId: jwt.id },
      data:  { availability },
    });
    return NextResponse.json({ doctor });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
