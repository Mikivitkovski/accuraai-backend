import { Request, Response } from "express";
import { AppDataSource } from "../db/dataSource";
import { Plan } from "../entities/Plan";

export const PlanController = {
  async updatePlan(req: Request, res: Response) {
    const role = (req as any).auth?.role;
    if (role !== "admin" && role !== "superadmin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const id = String(req.params.id || "");
    const { price } = req.body ?? {};

    if (!id) return res.status(400).json({ error: "Missing id" });

    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      return res.status(400).json({ error: "Invalid price" });
    }

    const repo = AppDataSource.getRepository(Plan);
    const plan = await repo.findOne({ where: { id } });
    if (!plan) return res.status(404).json({ error: "Plan not found" });

    plan.price = priceNum;
    await repo.save(plan);

    return res.json({ plan });
  },
};