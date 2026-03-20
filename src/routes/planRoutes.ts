import { Router } from "express";
import { PlanController } from "../controllers/planController";

const router = Router();

router.patch("/:id", PlanController.updatePlan);

export default router;