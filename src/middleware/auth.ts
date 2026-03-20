import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AppDataSource } from "../db/dataSource";
import { User, UserRole } from "../entities/User";

const JWT_SECRET = env.JWT_SECRET!;

function getAuthCookieFromHeader(cookieHeader?: string): string | undefined {
  if (!cookieHeader) return undefined;
  const parts = cookieHeader.split(";").map((c) => c.trim());
  const authPart = parts.find((p) => p.startsWith("auth="));
  if (!authPart) return undefined;
  return authPart.substring("auth=".length);
}

interface JwtPayload {
  sub: string;
  email: string;
  role?: UserRole | null;
  organizationId?: string | null;
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const headerToken = (req.headers.authorization || "").split(" ")[1];
  const cookieToken = (req as any).cookies?.auth as string | undefined;
  const headerCookieToken = getAuthCookieFromHeader(req.headers.cookie);

  const token = headerToken || cookieToken || headerCookieToken;

  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;

    let organizationId = payload.organizationId ?? null;

    let role: UserRole | null = null;

    const repo = AppDataSource.getRepository(User);
    const user = await repo.findOne({
      where: { id: payload.sub },
      select: ["id", "email", "organizationId", "role"],
    });

    role = user?.role ?? null;
    organizationId = user?.organizationId ?? organizationId;

    (req as any).auth = {
      userId: payload.sub,
      email: payload.email,
      role,
      organizationId,
    };

    next();
  } catch (e) {
    console.error("authenticate failed:", e);
    res.status(401).json({ error: "Unauthorized" });
  }
}