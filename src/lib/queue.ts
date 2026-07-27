import { prisma } from "./prisma";

const ACTIVE_STATUSES = ["WAITING", "ASSIGNED", "IN_CONSULTATION"] as const;
const AVG_CONSULTATION_MINUTES = 10;

export async function assignDoctor(): Promise<string | null> {
  const doctors = await prisma.doctor.findMany({
    where: { approved: true, availability: "AVAILABLE" },
    include: {
      queueEntries: {
        where: { status: { in: [...ACTIVE_STATUSES] } },
        select: { id: true },
      },
    },
    orderBy: { lastAssignedAt: "asc" },
  });

  if (doctors.length === 0) return null;

  // Pick the doctor with fewest active queue entries; use lastAssignedAt as tie-breaker
  doctors.sort((a, b) => {
    const diff = a.queueEntries.length - b.queueEntries.length;
    if (diff !== 0) return diff;
    const aTime = a.lastAssignedAt?.getTime() ?? 0;
    const bTime = b.lastAssignedAt?.getTime() ?? 0;
    return aTime - bTime;
  });

  return doctors[0].id;
}

export async function getQueuePosition(doctorId: string): Promise<number> {
  const count = await prisma.queue.count({
    where: { doctorId, status: { in: [...ACTIVE_STATUSES] } },
  });
  return count + 1;
}

export async function estimatedWaitMinutes(doctorId: string, position: number): Promise<number> {
  return Math.max(0, (position - 1)) * AVG_CONSULTATION_MINUTES;
}
