import { Router } from "express";
import multer from "multer";
import { AppDataSource } from "../db/dataSource";
import { Organization } from "../entities/Organization";

import {
  createOrganization,
  listOrganizations,
  getOrganization,
  updateOrganization,
  deleteOrganization,
  initOrganizationStorage,
  uploadOrganizationFile,
  listOrganizationFiles,
  deleteOrganizationFile,
  getOrganizationFileUrl,
  uploadCompanyLogo,
  getCompanyLogoUrl,
  deleteCompanyLogo,
} from "../controllers/organizationController";

import { validate } from "../middleware/validate";
import { requireOrgMember } from "../middleware/requireOrgMember";
import { authenticate } from "../middleware/auth";

import {
  OrganizationCreateSchema,
  OrganizationUpdateSchema,
  OrganizationIdParam,
  OrganizationListQuerySchema,
  OrganizationFileParam,
} from "../schemas/organizationSchema";

const router = Router();

const organizationRepo = () => AppDataSource.getRepository(Organization);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.get(
  "/",
  authenticate,
  requireOrgMember,
  validate(OrganizationListQuerySchema, "query"),
  async (req, res) => {
    const orgId = (req as any).orgId as string;
    const withRelations = !!req.query.relations;

    const org = await organizationRepo().findOne({
      where: { id: orgId },
      relations: withRelations ? ({ users: true, files: true } as any) : undefined,
    } as any);

    return res.json(org ? [org] : []);
  }
);

router.get(
  "/:id",
  authenticate,
  requireOrgMember,
  validate(OrganizationIdParam, "params"),
  getOrganization
);

router.get(
  "/:id/files",
  authenticate,
  requireOrgMember,
  validate(OrganizationIdParam, "params"),
  listOrganizationFiles
);

router.get(
  "/:id/files/:fileId/url",
  authenticate,
  requireOrgMember,
  validate(OrganizationFileParam, "params"),
  getOrganizationFileUrl
);

router.post(
  "/:id/files",
  authenticate,
  requireOrgMember,
  validate(OrganizationIdParam, "params"),
  upload.single("file"),
  uploadOrganizationFile
);

router.delete(
  "/:id/files/:fileId",
  authenticate,
  requireOrgMember,
  validate(OrganizationFileParam, "params"),
  deleteOrganizationFile
);

router.post(
  "/:id/storage/init",
  authenticate,
  requireOrgMember,
  validate(OrganizationIdParam, "params"),
  initOrganizationStorage
);

router.post("/", authenticate, validate(OrganizationCreateSchema), createOrganization);

router.patch(
  "/:id",
  authenticate,
  requireOrgMember,
  validate(OrganizationIdParam, "params"),
  validate(OrganizationUpdateSchema),
  updateOrganization
);

router.delete(
  "/:id",
  authenticate,
  requireOrgMember,
  validate(OrganizationIdParam, "params"),
  deleteOrganization
);

router.post("/:id/logo", authenticate, requireOrgMember, ...uploadCompanyLogo);
router.get("/:id/logo/url", authenticate, requireOrgMember, getCompanyLogoUrl);
router.delete("/:id/logo", authenticate, requireOrgMember, ...deleteCompanyLogo);

export default router;