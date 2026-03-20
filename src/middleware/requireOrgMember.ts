import { Request, Response, NextFunction } from "express";
import { AppDataSource } from "../db/dataSource";
import { User } from "../entities/User";

const userRepo = () => AppDataSource.getRepository(User);

export async function requireOrgMember(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const userId = (req as any).auth?.userId as string | undefined;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const user = await userRepo().findOne({ where: { id: userId } });
  if (!user?.organizationId) return res.status(403).json({ error: "Forbidden" });

  const orgIdFromPath = (req.params as any)?.id as string | undefined;
  if (orgIdFromPath && orgIdFromPath !== user.organizationId) {
    return res.status(403).json({ error: "Forbidden" });
  }

  (req as any).orgId = user.organizationId;
  next();
}

export async function requireOrgOwner(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authUserId = (req as any).auth?.userId as string | undefined;
  if (!authUserId) return res.status(401).json({ error: "Unauthorized" });

  const me = await userRepo().findOne({ where: { id: authUserId } });
  if (!me || !me.organizationId) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (me.role !== "owner") {
    return res
      .status(403)
      .json({ error: "Only organization owner can perform this action" });
  }

  (req as any).orgId = me.organizationId;
  next();
}

export async function requireSameOrgOrSelf(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authUserId = (req as any).auth?.userId as string | undefined;
  if (!authUserId) return res.status(401).json({ error: "Unauthorized" });

  const me = await userRepo().findOne({ where: { id: authUserId } });
  if (!me) return res.status(401).json({ error: "Unauthorized" });

  if (me.role === "owner" && me.organizationId) {
    (req as any).orgId = me.organizationId;
    return next();
  }

  if (req.params.id && req.params.id === me.id) return next();

  return res.status(403).json({ error: "Forbidden" });
}
