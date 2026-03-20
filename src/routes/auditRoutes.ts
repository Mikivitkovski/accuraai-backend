import { Router } from "express";
import { z } from "zod";
import { AppDataSource } from "../db/dataSource";
import { AuditLog } from "../entities/AuditLog";
import { requireOrgMember } from "../middleware/requireOrgMember";
import { validate } from "../middleware/validate";
import { authenticate } from "../middleware/auth";

const router = Router();

const OrgIdParam = z.object({
    id: z.string().uuid(),
});

const AuditLogQuerySchema = z.object({
    q: z.string().optional(),
    category: z.string().optional(),
    severity: z.string().optional(),
    userId: z.string().uuid().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

function mapAuditLog(a: any) {
    return {
        id: a.id,

        orgId: a.orgId ?? a.org_id,
        actorUserId: a.actorUserId ?? a.actor_user_id ?? null,

        action: a.action,
        category: a.category,
        severity: a.severity,
        description: a.description,

        details: a.details ?? null,
        ip: a.ip ?? null,

        userAgent: a.userAgent ?? a.user_agent ?? null,
        createdAt: a.createdAt ?? a.created_at,
    };
}


router.get(
  "/organizations/:id/audit-logs",
  authenticate,
  requireOrgMember,
  validate(OrgIdParam, "params"),
  validate(AuditLogQuerySchema, "query"),
  async (req, res) => {
    const orgId = req.params.id;
    const { q, category, severity, userId, page, pageSize } = req.query as any;

    const repo = AppDataSource.getRepository(AuditLog);

    let qb = repo.createQueryBuilder("a").where("a.org_id = :orgId", { orgId });

    if (category) qb = qb.andWhere("a.category = :category", { category });
    if (severity) qb = qb.andWhere("a.severity = :severity", { severity });
    if (userId) qb = qb.andWhere("a.actor_user_id = :userId", { userId });

    if (q && String(q).trim()) {
      qb = qb.andWhere("(a.description ILIKE :q OR a.action ILIKE :q)", {
        q: `%${String(q).trim()}%`,
      });
    }

    const [items, total] = await qb
      .orderBy("a.created_at", "DESC")
      .skip((Number(page) - 1) * Number(pageSize))
      .take(Number(pageSize))
      .getManyAndCount();

    return res.json({
      items: items.map(mapAuditLog),
      total,
      page: Number(page),
      pageSize: Number(pageSize),
    });
  }
);

export default router;
