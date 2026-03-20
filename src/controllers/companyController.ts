import { Request, Response } from "express";
import { AppDataSource } from "../db/dataSource";
import { Company } from "../entities/Company";
import { errorMsg } from "../utils/httpError";
import { writeAuditLog } from "../services/audit";
import { FileEntity } from "../entities/File";

const companyRepo = () => AppDataSource.getRepository(Company);

function normalizeCompanyName(input: unknown) {
  return String(input ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
}

export const listCompanies = async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).orgId as string;
    const rows = await companyRepo().find({
      where: { organizationId: orgId } as any,
      order: { createdAt: "DESC" } as any,
    });
    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: errorMsg(e) });
  }
};

export const createOrGetCompany = async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).orgId as string;
    const actorUserId = (req as any).auth?.userId ?? null;

    const name = normalizeCompanyName((req.body as any)?.name);
    if (!name || name.length < 2) {
      return res.status(400).json({ error: "name is required" });
    }

    let company = await companyRepo().findOneBy({ organizationId: orgId, name } as any);

    if (!company) {
      company = companyRepo().create({ organizationId: orgId, name });
      await companyRepo().save(company);

      await writeAuditLog({
        orgId,
        actorUserId,
        action: "company.created",
        category: "Company",
        severity: "info",
        description: "Company created.",
        details: { companyId: company.id, name: company.name },
        ip: req.ip,
        userAgent: req.get("user-agent") ?? null,
      });
    }

    return res.status(201).json(company);
  } catch (e) {
    return res.status(500).json({ error: errorMsg(e) });
  }
};

export const listCompaniesWithFiles = async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).orgId as string;

    const rows = await companyRepo()
      .createQueryBuilder("c")
      .innerJoin(
        FileEntity,
        "f",
        'f."companyId" = c.id AND f."organizationId" = c."organizationId"'
      )
      .where('c."organizationId" = :orgId', { orgId })
      .select([
        "c.id as id",
        "c.name as name",
        "c.createdAt as createdAt",
        "COUNT(f.id) as fileCount",
      ])
      .groupBy("c.id")
      .addGroupBy("c.name")
      .addGroupBy("c.createdAt")
      .orderBy("c.createdAt", "DESC")
      .getRawMany();

    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: errorMsg(e) });
  }
};