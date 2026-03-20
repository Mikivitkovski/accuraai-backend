import { Router } from "express";
import { MeController } from "../controllers/meController";
import { authenticate } from "../middleware/auth";
import { requireOrgMember } from "../middleware/requireOrgMember";
import { AppDataSource } from "../db/dataSource";
import { User } from "../entities/User";

const meRouter = Router();

const userRepo = () => AppDataSource.getRepository(User);

meRouter.get(
  "/",
  authenticate,
  requireOrgMember,
  async (req, res) => {
    try {
      const userId = (req as any).auth?.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const user = await userRepo().findOne({
        where: { id: userId } as any,
      });

      if (!user) return res.status(404).json({ error: "User not found" });

      return res.json({
        id: user.id,
        organizationId: user.organizationId,
        role: user.role,
        email: user.email,
      });
    } catch (e) {
      console.error("GET /api/me failed:", e);
      return res.status(500).json({ error: "Failed to fetch user" });
    }
  }
);

meRouter.patch(
  "/notify-by-email",
  authenticate,
  requireOrgMember,
  MeController.updateNotifyByEmail
);

export default meRouter;