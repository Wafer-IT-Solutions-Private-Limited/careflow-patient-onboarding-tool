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
    const doctorId = searchParams.get("doctorId");
    if (doctorId) rooms.push(`doctor:${doctorId}`);
  } else if (role === "PATIENT") {
    const patientId = searchParams.get("patientId");
    if (patientId) rooms.push(`patient:${patientId}`);
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
