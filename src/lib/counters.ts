import { prisma } from "./prisma";
import { todayISTStr } from "./timezone";

function todayStr(): string {
  return todayISTStr();
}

async function nextCount(type: string): Promise<number> {
  const date = todayStr();
  const result = await prisma.$transaction(async (tx) => {
    const record = await tx.dailyCounter.upsert({
      where:  { type_date: { type, date } },
      update: { count: { increment: 1 } },
      create: { type, date, count: 1 },
    });
    return record.count;
  });
  return result;
}

export async function generatePRN(): Promise<string> {
  const n = await nextCount("PRN");
  return `PAT-${todayStr()}-${String(n).padStart(4, "0")}`;
}

export async function generateToken(): Promise<string> {
  const n = await nextCount("TOKEN");
  return `A${String(n).padStart(3, "0")}`;
}

export async function generateVisitId(): Promise<string> {
  const n = await nextCount("VISIT");
  return `VIS-${todayStr()}-${String(n).padStart(5, "0")}`;
}
