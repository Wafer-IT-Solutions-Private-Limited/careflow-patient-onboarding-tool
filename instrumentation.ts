export async function register() {
  // Only run in Node.js runtime (not edge), and only on the server
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { prisma } = await import("@/lib/prisma");
  const { todayISTStart } = await import("@/lib/timezone");

  const todayStart = todayISTStart();

  try {
    // Close stale open visits from previous days
    const staleOpen = await prisma.visit.updateMany({
      where: {
        status:    { in: ["WAITING", "ASSIGNED"] },
        visitDate: { lt: todayStart },
      },
      data: {
        status:       "CANCELLED",
        cancelReason: "Session expired — visit was open when server restarted",
      },
    });

    // Close stale in-consultation visits — doctor must have finished
    const staleConsult = await prisma.visit.updateMany({
      where: {
        status:    "IN_CONSULTATION",
        visitDate: { lt: todayStart },
      },
      data: { status: "COMPLETED" },
    });

    // Sync Queue rows to match
    await prisma.queue.updateMany({
      where: {
        status:  { in: ["WAITING", "ASSIGNED"] },
        visit:   { visitDate: { lt: todayStart } },
      },
      data: { status: "CANCELLED" },
    });

    await prisma.queue.updateMany({
      where: {
        status: "IN_CONSULTATION",
        visit:  { visitDate: { lt: todayStart } },
      },
      data: { status: "COMPLETED" },
    });

    const total = staleOpen.count + staleConsult.count;
    if (total > 0) {
      console.log(`[startup] Cleaned up ${total} stale visit(s) from previous session(s).`);
    }
  } catch (err) {
    // Non-fatal — log and continue booting
    console.error("[startup] Stale visit cleanup failed:", err);
  }
}
