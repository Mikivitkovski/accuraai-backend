import { Router } from "express";
import { validate } from "../middleware/validate";
import { UserCreateSchema, UserUpdateSchema } from "../schemas/authSchema";
import {
  createUser,
  listUsers,
  getUser,
  deleteUser,
  updateUser,
  uploadAvatar,
  getAvatarUrl,
  deleteAvatar,
  listOrgMembers,
  transferOwnership,
  linkMyOrganization,
} from "../controllers/authController";
import { authenticate } from "../middleware/auth";
import {
  requireOrgOwner,
  requireSameOrgOrSelf,
} from "../middleware/requireOrgMember";

const router = Router();

router.use(authenticate);

router.post("/me/organization", linkMyOrganization);

router.get("/", listUsers);

router.post("/", requireOrgOwner, validate(UserCreateSchema), createUser);
router.post("/member", requireOrgOwner, validate(UserCreateSchema), createUser);

router.post(
  "/member/:id/transfer-ownership",
  requireOrgOwner,
  transferOwnership
);

router.get("/member/list", requireOrgOwner, listOrgMembers);

router.patch(
  "/member/:id",
  requireOrgOwner,
  validate(UserUpdateSchema),
  updateUser
);
router.delete("/member/:id", requireOrgOwner, deleteUser);

router.get("/:id", requireSameOrgOrSelf, getUser);

router.patch("/:id", validate(UserUpdateSchema), updateUser);

router.delete("/:id", requireOrgOwner, deleteUser);

router.post("/:id/avatar", ...uploadAvatar);
router.get("/:id/avatar/url", getAvatarUrl);
router.delete("/:id/avatar", deleteAvatar);

export default router;