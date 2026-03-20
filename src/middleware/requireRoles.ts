import { Request, Response, NextFunction } from "express";
import { UserRole } from "../entities/User";

export function requireRoles(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as any).auth as { role?: UserRole | null } | undefined;

    if (!auth || !auth.role) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!allowedRoles.includes(auth.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    return next();
  };
}
