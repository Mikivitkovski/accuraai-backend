import { AppDataSource } from "./dataSource";
import { Plan } from "../entities/Plan";
import { DEFAULT_PLANS } from "../config/plans";

export async function ensurePlans() {
  const repo = AppDataSource.getRepository(Plan);

  for (const defaultPlan of DEFAULT_PLANS) {
    const exists = await repo.findOne({ where: { id: defaultPlan.id } });
    if (exists) continue; 

    await repo.insert({
      id: defaultPlan.id,
      name: defaultPlan.name,
      price: defaultPlan.price as any,
      currency: defaultPlan.currency,
      interval: defaultPlan.interval,
      features: defaultPlan.features as any,
    });
  }
}