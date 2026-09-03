import { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";
import { subscribeSSE, SSEEvent } from "@/lib/sse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("token");
  if (!cookie) return new Response("Unauthorized", { status: 401 });

  let jwt: { id: string; role: string } | null = null;
  try { jwt = await verifyToken(cookie.value); } catch { return new Response("Unauthorized", { status: 401 }); }

  // Determine which room(s) this client subscribes to
  const role = jwt.role;
  const searchParams = req.nextUrl.searchParams;
  const rooms: string[] = [];

  if (role === "ADMIN") {
    rooms.push("admin");
  } else if (role === "DOCTOR") {
    // Derive room from DB — never trust client-supplied doctorId
    const { prisma } = await import("@/lib/prisma");
    const doctor = await prisma.doctor.findUnique({ where: { userId: jwt.id } });
    if (doctor) rooms.push(`doctor:${doctor.id}`);
  } else if (role === "NURSE") {
    rooms.push("nurse");
  } else if (role === "PATIENT") {
    // Derive room from DB — never trust client-supplied patientId
    const { prisma } = await import("@/lib/prisma");
    const patient = await prisma.patient.findFirst({ where: { userId: jwt.id } });
    if (patient) rooms.push(`patient:${patient.id}`);
  }

  if (rooms.length === 0) return new Response("No room", { status: 400 });

  const encoder = new TextEncoder();
  let unsubscribers: (() => void)[] = [];
  let controller: ReadableStreamDefaultController<Uint8Array>;

  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      controller = ctrl;
      // Send initial heartbeat
      ctrl.enqueue(encoder.encode(": connected\n\n"));

      const onEvent = (event: SSEEvent) => {
        try {
          ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch { /* stream closed */ }
      };

      unsubscribers = rooms.map(room => subscribeSSE(room, onEvent));

      // Heartbeat every 25s to keep connection alive
      const hb = setInterval(() => {
        try { ctrl.enqueue(encoder.encode(": ping\n\n")); }
        catch { clearInterval(hb); }
      }, 25_000);

      // Cleanup when client disconnects
      req.signal.addEventListener("abort", () => {
        clearInterval(hb);
        unsubscribers.forEach(u => u());
        try { ctrl.close(); } catch { /* already closed */ }
      });
    },
    cancel() {
      unsubscribers.forEach(u => u());
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection":    "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
