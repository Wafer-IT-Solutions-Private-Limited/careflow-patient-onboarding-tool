import { EventEmitter } from "events";

// Module-level singleton — shared across all API route invocations in the same process
const emitter = new EventEmitter();
emitter.setMaxListeners(200);

export type SSEEvent =
  | { type: "queue:updated";      room: "admin" | `doctor:${string}` | `patient:${string}` | "nurse" }
  | { type: "patient:called";     room: `doctor:${string}` | `patient:${string}`; token: string }
  | { type: "visit:cancelled";    room: `doctor:${string}` | `patient:${string}` | "admin" | "nurse"; visitId: string; cancelReason?: string }
  | { type: "doctor:status";      room: "admin"; doctorId: string; availability: string }
  | { type: "patient:registered"; room: "admin"; prn: string }
  | { type: "appointment:booked"; room: `patient:${string}` }
  | { type: "vitals:requested";   room: "nurse"; visitId: string; doctorId: string; patientName: string; requiredFields?: string[] }
  | { type: "vitals:updated";     room: `doctor:${string}`; visitId: string };

export function emitSSE(event: SSEEvent) {
  emitter.emit(event.room, event);
  // Admin room gets a copy of everything
  if (event.room !== "admin") {
    emitter.emit("admin", event);
  }
  // Nurse room gets queue updates
  if (event.type === "queue:updated" && event.room === "admin") {
    emitter.emit("nurse", event);
  }
}

export function subscribeSSE(room: string, cb: (e: SSEEvent) => void) {
  emitter.on(room, cb);
  return () => emitter.off(room, cb);
}
