import { Router } from "express";
import { BillingController } from "../controllers/billingController";
import { authenticate } from "../middleware/auth";

const r = Router();

r.get("/me", authenticate, BillingController.getMyBilling);
r.post("/payment-method", authenticate, BillingController.addPaymentMethod);
r.post("/checkout", authenticate, BillingController.pretendCheckout);
r.post("/cancel", authenticate, BillingController.cancelSubscription);
r.delete("/payment-method/:id", authenticate, BillingController.deletePaymentMethod);

export default r;