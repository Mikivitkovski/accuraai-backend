import { Request, Response, NextFunction } from "express";
import multer from "multer";
import { AppDataSource } from "../db/dataSource";
import { Organization } from "../entities/Organization";
import { User } from "../entities/User";
import {
  initOrgStorage,
  purgeOrgStorage,
  uploadOrgCompanyFileByIdInUploadedDocuments,
  getSignedGetObjectUrl,
  deleteKey,
  uploadOrgLogo,
  getOrgLogoUrl,
  orgStandardBasePrefix,
  sanitizeCompanyFolder,
} from "../services/s3";
import { FileEntity } from "../entities/File";
import { errorMsg } from "../utils/httpError";
import { writeAuditLog } from "../services/audit";
import { Company } from "../entities/Company";

const organizationRepo = () => AppDataSource.getRepository(Organization);
const userRepo = () => AppDataSource.getRepository(User);
const fileRepo = () => AppDataSource.getRepository(FileEntity);

type RequestWithFile = Request & { file?: Express.Multer.File };

const coerceQueryBool = (v: unknown): boolean => {
  if (Array.isArray(v)) return v.some(coerceQueryBool);
  if (typeof v === "string") {
    const s = v.toLowerCase();
    return s === "true" || s === "1" || s === "yes" || s === "on";
  }
  if (typeof v === "boolean") return v;
  return false;
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

function pick<T extends object>(obj: T, keys: (keyof T)[]) {
  const out: Partial<T> = {};
  for (const k of keys) out[k] = obj[k];
  return out;
}

function diffShallow(before: any, after: any) {
  const changed: Record<string, { from: any; to: any }> = {};
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);

  for (const k of keys) {
    const a = (before as any)?.[k];
    const b = (after as any)?.[k];
    if (a !== b) changed[k] = { from: a, to: b };
  }
  return changed;
}

/**
 * 🚫 Old folders (legal/technical/etc) are no longer needed for upload path.
 * We KEEP folder query parsing for backward compatibility with list/filter,
 * but your upload will ignore it and use Company Name folder.
 */
function assertFolderQuery(folder: unknown): string | undefined {
  if (folder === undefined || folder === null || folder === "") return undefined;
  if (Array.isArray(folder)) folder = folder[0];

  const f = String(folder).trim();

  const allowed = new Set([
    "legal",
    "financial",
    "technical",
    "equipment",
    "hr",
    "company-certificates",
    "contracts-references",
  ]);

  if (!allowed.has(f)) throw new Error("Invalid folder");
  return f;
}

function normalizeWebsiteForStorage(input: unknown): string | null {
  if (input === undefined || input === null) return null;

  const raw = String(input).trim();
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) return raw;

  const noSlashes = raw.replace(/^\/+/, "");

  if (/^www\./i.test(noSlashes)) return noSlashes;

  const parts = noSlashes.split(".");
  if (parts.length >= 3) return noSlashes;

  return `www.${noSlashes}`;
}

function assertUserInOrgOrAdminFactory() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUserId = (req as any).auth?.userId as string | undefined;
      if (!authUserId) return res.status(401).json({ error: "Unauthorized" });

      const [user, org] = await Promise.all([
        userRepo().findOneBy({ id: authUserId }),
        organizationRepo().findOneBy({ id: req.params.id }),
      ]);
      if (!org) return res.status(404).json({ error: "Not found" });

      if (!user || user.organizationId !== org.id) {
        return res.status(403).json({ error: "Forbidden" });
      }

      (req as any).__org = org;
      next();
    } catch (e) {
      return res.status(500).json({ error: errorMsg(e) });
    }
  };
}

export const uploadCompanyLogo = [
  upload.single("file"),
  assertUserInOrgOrAdminFactory(),
  async (req: Request, res: Response) => {
    try {
      const org = (req as any).__org as Organization;
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ error: "file is required" });

      if (org.logoPath) {
        try {
          await deleteKey(org.logoPath);
        } catch { }
      }

      const uploaded = await uploadOrgLogo(org.id, file.originalname, file.buffer, file.mimetype);
      org.logoPath = uploaded.key;
      await organizationRepo().save(org);

      const actorUserId = (req as any).auth?.userId ?? null;

      await writeAuditLog({
        orgId: org.id,
        actorUserId,
        action: "org.logo.updated",
        category: "Organization",
        severity: "info",
        description: "Company logo updated.",
        details: { filename: file.originalname },
        ip: req.ip,
        userAgent: req.get("user-agent") ?? null,
      });

      return res.status(201).json({ ok: true, file: { key: uploaded.key } });
    } catch (e) {
      console.error("POST /organizations/:id/logo failed:", e);
      return res.status(500).json({ error: errorMsg(e) });
    }
  },
];

export async function getCompanyLogoUrl(req: Request, res: Response) {
  try {
    const org = await organizationRepo().findOneBy({ id: req.params.id });
    if (!org) return res.status(404).json({ error: "Not found" });
    if (!org.logoPath) return res.status(404).json({ error: "No logo" });

    const url = await getOrgLogoUrl(org.logoPath);
    return res.json({ url });
  } catch (e) {
    console.error("GET /organizations/:id/logo/url failed:", e);
    return res.status(500).json({ error: errorMsg(e) });
  }
}

export const deleteCompanyLogo = [
  assertUserInOrgOrAdminFactory(),
  async (req: Request, res: Response) => {
    try {
      const org = (req as any).__org as Organization;
      if (org.logoPath) {
        try {
          await deleteKey(org.logoPath);
        } catch { }
        org.logoPath = null as any;
        await organizationRepo().save(org);
      }

      const actorUserId = (req as any).auth?.userId ?? null;

      await writeAuditLog({
        orgId: org.id,
        actorUserId,
        action: "org.logo.deleted",
        category: "Organization",
        severity: "info",
        description: "Company logo deleted.",
        details: {},
        ip: req.ip,
        userAgent: req.get("user-agent") ?? null,
      });

      return res.status(204).send();
    } catch (e) {
      console.error("DELETE /organizations/:id/logo failed:", e);
      return res.status(500).json({ error: errorMsg(e) });
    }
  },
];

export const createOrganization = async (req: Request, res: Response) => {
  try {
    if (Array.isArray(req.body)) {
      return res.status(400).json({ error: "Body must be a single object" });
    }

    const website = normalizeWebsiteForStorage((req.body as any).website);

    const body: Partial<Organization> = {
      ...req.body,
      website,
      taxId: (req.body as any).taxId ?? null,
      registrationDate: (req.body as any).registrationDate ?? null,
      contactPosition: (req.body as any).contactPosition ?? null,
      legalName: (req.body as any).legalName ?? (req.body as any).name ?? "",
      name: (req.body as any).name,
      country: (req.body as any).country,
      contactName: (req.body as any).contactName ?? null,
      contactEmail: (req.body as any).contactEmail ?? null,
      contactPhone: (req.body as any).contactPhone ?? null,
    };

    const org = organizationRepo().create(body);
    await organizationRepo().save(org);

    const actorUserId = (req as any).auth?.userId ?? null;

    await writeAuditLog({
      orgId: org.id,
      actorUserId,
      action: "org.created",
      category: "Organization",
      severity: "info",
      description: "Organization created.",
      details: {
        name: org.name ?? null,
        legalName: org.legalName ?? null,
        country: org.country ?? null,
      },
      ip: req.ip,
      userAgent: req.get("user-agent") ?? null,
    });

    const userId = (req as any).auth?.userId as string | undefined;
    if (userId) {
      const user = await userRepo().findOne({ where: { id: userId } });
      if (user) {
        user.organizationId = org.id;
        if (!user.role || user.role === "member") user.role = "owner";
        await userRepo().save(user);
      }
    }

    try {
      await initOrgStorage(org.id);
    } catch (e) {
      console.error("initOrgStorage failed:", e);
    }

    return res.status(201).json(org);
  } catch (e) {
    return res.status(400).json({ error: String(e) });
  }
};

export const listOrganizationFiles = async (req: Request, res: Response) => {
  try {
    const org = await organizationRepo().findOneBy({ id: req.params.id });
    if (!org) return res.status(404).json({ error: "Not found" });

    const companyIdQ = Array.isArray(req.query.companyId)
      ? req.query.companyId[0]
      : req.query.companyId;

    const where: any = { organizationId: org.id };
    if (companyIdQ) where.companyId = String(companyIdQ);

    const files = await fileRepo().find({
      where,
      order: { createdAt: "DESC" } as any,
    });

    return res.json(files);
  } catch (e) {
    console.error("GET /organizations/:id/files failed:", e);
    return res.status(500).json({ error: errorMsg(e) });
  }
};

export const deleteOrganizationFile = async (req: Request, res: Response) => {
  try {
    const { id, fileId } = req.params as { id: string; fileId: string };

    const file = await fileRepo().findOneBy({ id: fileId, organizationId: id } as any);
    if (!file) return res.status(404).json({ error: "Not found" });

    try {
      await deleteKey(file.path);
    } catch (e) {
      console.error("S3 delete failed:", e);
      return res.status(502).json({
        error: "Failed to remove file from storage",
        detail: errorMsg(e, "Unknown S3 error"),
      });
    }

    await fileRepo().remove(file);

    const actorUserId = (req as any).auth?.userId ?? null;

    let companyName: string | null = null;
    if (file.companyId) {
      const c = await companyRepo().findOneBy({ id: file.companyId, organizationId: id } as any);
      companyName = c?.name ?? null;
    }

    await writeAuditLog({
      orgId: id,
      actorUserId,
      action: "org.file.deleted",
      category: "Document",
      severity: "info",
      description: "File deleted.",
      details: {
        filename: file.filename,
        companyId: file.companyId ?? null,
        companyName,
      },
      ip: req.ip,
      userAgent: req.get("user-agent") ?? null,
    });

    return res.status(204).send();
  } catch (e) {
    console.error("DELETE /organizations/:id/files/:fileId failed:", e);
    return res.status(500).json({ error: errorMsg(e) });
  }
};

export const getOrganizationFileUrl = async (req: Request, res: Response) => {
  try {
    const { id, fileId } = req.params;

    const dispositionQ = String(req.query.disposition || "inline").toLowerCase();
    const inline = dispositionQ !== "attachment";

    const file = await fileRepo().findOne({
      where: { id: fileId, organizationId: id } as any,
    });
    if (!file) return res.status(404).json({ error: "Not found" });

    const url = await getSignedGetObjectUrl(file.path, {
      inline,
      filename: file.filename,
      contentType: file.mimeType || undefined,
    });

    try {
      const actorUserId = (req as any).auth?.userId ?? null;

      let companyName: string | null = null;
      if (file.companyId) {
        const c = await companyRepo().findOneBy({ id: file.companyId, organizationId: id } as any);
        companyName = c?.name ?? null;
      }

      await writeAuditLog({
        orgId: id,
        actorUserId,
        action: inline ? "org.file.viewed" : "org.file.downloaded",
        category: "Document",
        severity: "info",
        description: inline ? "Document viewed." : "Document downloaded.",
        details: {
          filename: file.filename,
          companyId: file.companyId ?? null,
          companyName,
        },
        ip: req.ip,
        userAgent: req.get("user-agent") ?? null,
      });
    } catch (e) {
      console.warn("audit log (file view/download) failed:", e);
    }

    return res.json({ url });
  } catch (e) {
    console.error("GET /organizations/:id/files/:fileId/url failed:", e);
    return res.status(500).json({ error: errorMsg(e) });
  }
};

export const listOrganizations = async (req: Request, res: Response) => {
  try {
    const withRelations = coerceQueryBool(req.query.relations);

    const orgs = await organizationRepo().find(
      withRelations ? { relations: { users: true, files: true } } : undefined
    );

    return res.json(orgs);
  } catch (e) {
    console.error("GET /organizations failed:", e);
    return res.status(500).json({ error: errorMsg(e) });
  }
};

export const getOrganization = async (req: Request, res: Response) => {
  try {
    const org = await organizationRepo().findOne({
      where: { id: req.params.id },
      relations: { users: true, files: true },
    });
    if (!org) return res.status(404).json({ error: "Not found" });
    return res.json(org);
  } catch (e) {
    console.error("GET /organizations/:id failed:", e);
    return res.status(500).json({ error: errorMsg(e) });
  }
};

export const updateOrganization = async (req: Request, res: Response) => {
  try {
    const org = await organizationRepo().findOneBy({ id: req.params.id });
    if (!org) return res.status(404).json({ error: "Not found" });

    const AUDIT_FIELDS: (keyof Organization)[] = [
      "name",
      "legalName",
      "country",
      "taxId",
      "registrationDate",
      "website",
    ];
    const before = pick(org, AUDIT_FIELDS);

    if (Object.prototype.hasOwnProperty.call(req.body as any, "website")) {
      (req.body as any).website = normalizeWebsiteForStorage((req.body as any).website);
    }

    organizationRepo().merge(org, req.body);
    const saved = await organizationRepo().save(org);

    const after = pick(saved, AUDIT_FIELDS);
    const changed = diffShallow(before, after);

    if (Object.keys(changed).length > 0) {
      const actorUserId = (req as any).auth?.userId ?? null;

      await writeAuditLog({
        orgId: saved.id,
        actorUserId,
        action: "org.updated",
        category: "Organization",
        severity: "info",
        description: "Organization settings updated.",
        details: { changed },
        ip: req.ip,
        userAgent: req.get("user-agent") ?? null,
      });
    }

    return res.json(saved);
  } catch (e) {
    console.error("PATCH /organizations/:id failed:", e);
    return res.status(500).json({ error: errorMsg(e) });
  }
};

export const deleteOrganization = async (req: Request, res: Response) => {
  try {
    const org = await organizationRepo().findOneBy({ id: req.params.id });
    if (!org) return res.status(404).json({ error: "Not found" });

    try {
      const out = await purgeOrgStorage(org.id);
      console.log("S3 purge:", out);
    } catch (e) {
      console.error("S3 purge failed:", e);
      return res.status(502).json({
        error: "Failed to remove organization storage",
        detail: errorMsg(e, "Unknown S3 error"),
      });
    }

    const actorUserId = (req as any).auth?.userId ?? null;

    await writeAuditLog({
      orgId: org.id,
      actorUserId,
      action: "org.deleted",
      category: "Organization",
      severity: "error",
      description: "Organization deleted.",
      details: { name: org.name ?? null },
      ip: req.ip,
      userAgent: req.get("user-agent") ?? null,
    });

    await organizationRepo().remove(org);
    return res.status(204).send();
  } catch (e) {
    console.error("DELETE /organizations/:id failed:", e);
    return res.status(500).json({ error: errorMsg(e) });
  }
};

export const initOrganizationStorage = async (req: Request, res: Response) => {
  try {
    const org = await organizationRepo().findOneBy({ id: req.params.id });
    if (!org) return res.status(404).json({ error: "Not found" });

    const out = await initOrgStorage(org.id);
    return res.status(201).json({ ok: true, ...out });
  } catch (e) {
    console.error("POST /organizations/:id/storage/init failed:", e);
    return res.status(500).json({ error: "S3 init failed", detail: errorMsg(e) });
  }
};

const companyRepo = () => AppDataSource.getRepository(Company);

function normalizeCompanyName(input: unknown) {
  return String(input ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
}


export const uploadOrganizationFile = async (req: Request, res: Response) => {
  try {
    const org = await organizationRepo().findOneBy({ id: req.params.id });
    if (!org) return res.status(404).json({ error: "Not found" });

    const uploadedFile = (req as RequestWithFile).file;
    if (!uploadedFile) {
      return res.status(400).json({
        error: "file is required; send multipart/form-data with field 'file'",
      });
    }

    const actorUserId = (req as any).auth?.userId ?? null;

    const companyId = String((req.body as any)?.companyId ?? "").trim();
    if (!companyId) return res.status(400).json({ error: "companyId is required" });

    const company = await companyRepo().findOneBy({
      id: companyId,
      organizationId: org.id,
    });
    if (!company) return res.status(404).json({ error: "Company not found" });

    const uploaded = await uploadOrgCompanyFileByIdInUploadedDocuments(
      org.id,
      company.id,
      uploadedFile.originalname,
      uploadedFile.buffer,
      uploadedFile.mimetype || undefined
    );

    const entity = fileRepo().create({
      filename: uploadedFile.originalname,
      path: uploaded.key,
      mimeType: uploadedFile.mimetype || undefined,
      sizeBytes: String(uploadedFile.size),
      organizationId: org.id,
      companyId: company.id,
      uploadedBy: actorUserId,
      status: "uploaded",
    });

    await fileRepo().save(entity);
    await writeAuditLog({
      orgId: org.id,
      actorUserId,
      action: "document.uploaded",
      category: "Document",
      severity: "info",
      description: "Document uploaded.",
      details: {
        fileId: entity.id,
        filename: entity.filename,
        companyId: entity.companyId ?? null,
        mimeType: entity.mimeType ?? null,
        sizeBytes: entity.sizeBytes ?? null,
        status: entity.status ?? null,
      },
      ip: req.ip,
      userAgent: req.get("user-agent") ?? null,
    });

    return res.status(201).json({ file: entity, storage: uploaded });
  } catch (e) {
    console.error("POST /organizations/:id/files failed:", e);
    return res.status(500).json({ error: errorMsg(e) });
  }
};