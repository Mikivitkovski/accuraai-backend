import { AppDataSource } from "../db/dataSource";
import { AuditLog, AuditSeverity } from "../entities/AuditLog";

export async function writeAuditLog(input: {
    orgId: string;
    actorUserId: string | null;
    action: string;
    description: string;
    category?: string;
    severity?: AuditSeverity;
    details?: Record<string, unknown> | null;
    ip?: string | null;
    userAgent?: string | null;
}) {
    const repo = AppDataSource.getRepository(AuditLog);

    const row = repo.create({
        orgId: input.orgId,
        actorUserId: input.actorUserId,
        action: input.action,
        description: input.description,
        category: input.category ?? "Organization",
        severity: input.severity ?? "info",
        details: input.details ?? null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
    });

    await repo.save(row);
    return row;
}
