import { Request, Response, NextFunction } from "express";
import { AppDataSource } from "../db/dataSource";
import { Subscription } from "../entities/Subscription";
import { Plan } from "../entities/Plan";

export async function requirePlan(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any).auth?.userId as string | undefined;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const subRepo = AppDataSource.getRepository(Subscription);
  const planRepo = AppDataSource.getRepository(Plan);

  const sub = await subRepo.findOne({
    where: { userId, active: true },
    order: { createdAt: "DESC" as any },
  });

  const planId = sub?.planId ?? "free";

  const plan = await planRepo.findOne({ where: { id: planId } });
  if (!plan) return res.status(500).json({ error: "Plan config missing" });

  (req as any).subscription = sub ?? null;
  (req as any).plan = plan;

  next();
}