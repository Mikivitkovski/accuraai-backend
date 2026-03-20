import { Request, Response, NextFunction } from "express";
import { AppDataSource } from "../db/dataSource";
import { Subscription } from "../entities/Subscription";

export async function requireActiveSubscription(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any).auth?.userId as string | undefined;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const repo = AppDataSource.getRepository(Subscription);
  const sub = await repo.findOne({ where: { userId, active: true } });

  if (!sub) {
    return res.status(402).json({
      error: "Subscription required",
      code: "SUBSCRIPTION_INACTIVE",
    });
  }

  (req as any).subscription = sub;
  next();
}