import { Router } from "express";
import { NotificationController } from "../controllers/notificationController";

const notificationRouter: Router = Router();

notificationRouter.get("/", NotificationController.list);
notificationRouter.post("/", NotificationController.create);
notificationRouter.patch("/mark-all-read", NotificationController.markAllRead);
notificationRouter.patch("/:id", NotificationController.update);
notificationRouter.delete("/:id", NotificationController.remove);

export default notificationRouter;