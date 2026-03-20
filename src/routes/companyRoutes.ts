import { Router } from "express";
import { AppDataSource } from "../db/dataSource";
import { Company } from "../entities/Company";
import { authenticate } from "../middleware/auth";
import { requireOrgMember } from "../middleware/requireOrgMember";
import { errorMsg } from "../utils/httpError";
import { FileEntity } from "../entities/File";

const router = Router();
const companyRepo = () => AppDataSource.getRepository(Company);

router.get("/with-files", authenticate, requireOrgMember, async (req, res) => {
  try {
    const orgId = (req as any).orgId as string | undefined;
    if (!orgId) return res.status(401).json({ error: "Unauthorized" });

    const rows = await companyRepo()
      .createQueryBuilder("c")
      .innerJoin(
        FileEntity,
        "f",
        "f.companyId = c.id AND f.organizationId = c.organizationId"
      )
      .where("c.organizationId = :orgId", { orgId })
      .select([
        "c.id as id",
        "c.name as name",
        "COUNT(f.id) as fileCount",
      ])
      .groupBy("c.id")
      .addGroupBy("c.name")
      .orderBy("c.name", "ASC")
      .getRawMany();

    return res.json(
      rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        fileCount: Number(r.fileCount || 0),
      }))
    );
  } catch (e) {
    return res.status(500).json({ error: errorMsg(e) });
  }
});

router.get("/", authenticate, requireOrgMember, async (req, res) => {
  try {
    const orgId = (req as any).orgId as string | undefined;
    if (!orgId) return res.status(401).json({ error: "Unauthorized" });

    const items = await companyRepo().find({
      where: { organizationId: orgId } as any,
      order: { createdAt: "DESC" } as any,
    });

    return res.json(items.map((c) => ({ id: c.id, name: c.name })));
  } catch (e) {
    return res.status(500).json({ error: errorMsg(e) });
  }
});


router.post("/", authenticate, requireOrgMember, async (req, res) => {
  try {
    const orgId = (req as any).orgId as string | undefined;
    if (!orgId) return res.status(401).json({ error: "Unauthorized" });

    const name = String((req.body as any)?.name ?? "").trim();
    if (name.length < 2) return res.status(400).json({ error: "name is required" });

    const existing = await companyRepo()
      .createQueryBuilder("c")
      .where("c.organization_id = :orgId", { orgId })
      .andWhere("lower(c.name) = lower(:name)", { name })
      .getOne();

    if (existing) return res.status(200).json({ id: existing.id, name: existing.name });

    const created = companyRepo().create({ organizationId: orgId, name });
    const saved = await companyRepo().save(created);

    return res.status(201).json({ id: saved.id, name: saved.name });
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
      try {
        const orgId = (req as any).orgId as string | undefined;
        const name = String((req.body as any)?.name ?? "").trim();

        const existing = await companyRepo()
          .createQueryBuilder("c")
          .where("c.organization_id = :orgId", { orgId })
          .andWhere("lower(c.name) = lower(:name)", { name })
          .getOne();

        if (existing) return res.status(200).json({ id: existing.id, name: existing.name });
      } catch { }
    }

    return res.status(500).json({ error: errorMsg(e) });
  }
});


export default router;