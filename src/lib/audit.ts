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
  await prisma.auditLog.create({ data: opts }).catch(() => {});
}
