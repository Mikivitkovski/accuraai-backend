import type { Request, Response, NextFunction } from "express";

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;

  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const role = String(user.role || "").toUpperCase();
  if (role !== "ADMIN") return res.status(403).json({ error: "Forbidden" });

  return next();
}
