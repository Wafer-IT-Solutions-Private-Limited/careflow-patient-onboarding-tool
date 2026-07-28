import { prisma } from "./prisma";

interface AuditOptions {
  userId?:   string;
  userRole?: string;
  action:    string;
  entity:    string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

export async function logAudit(opts: AuditOptions): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await prisma.auditLog.create({ data: opts as any }).catch(() => {});
}
