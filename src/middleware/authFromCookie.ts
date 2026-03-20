import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export function authFromCookie(req: Request, res: Response, next: NextFunction) {
  const cookieHeader = req.headers.cookie || "";

  const match = cookieHeader.match(/(?:^|;\s*)auth=([^;]+)/);
  const token = match ? decodeURIComponent(match[1]) : null;

  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as any;

    (req as any).user = payload;
    (req as any).orgId =
      payload.organizationId ??
      payload.orgId ??
      payload.org_id ??
      null;

    if (!(req as any).orgId) {
      return res.status(401).json({ error: "Unauthorized - missing organizationId in token" });
    }

    return next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}