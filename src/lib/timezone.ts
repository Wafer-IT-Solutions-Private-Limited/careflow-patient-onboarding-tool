// IST = UTC+5:30
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function nowIST(): Date {
  return new Date(Date.now() + IST_OFFSET_MS);
}

/** YYYYMMDD string in IST */
export function todayISTStr(): string {
  return nowIST().toISOString().slice(0, 10).replace(/-/g, "");
}

/** Midnight IST expressed as a UTC Date — use for DB range queries */
export function todayISTStart(): Date {
  const ist = nowIST();
  // Build midnight in IST date components, then subtract IST offset to get UTC
  const midnightIST = Date.UTC(
    ist.getUTCFullYear(),
    ist.getUTCMonth(),
    ist.getUTCDate(),
    0, 0, 0, 0,
  );
  return new Date(midnightIST - IST_OFFSET_MS);
}
