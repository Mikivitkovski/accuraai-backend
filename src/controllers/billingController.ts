import { Request, Response } from "express";
import { AppDataSource } from "../db/dataSource";
import { Plan } from "../entities/Plan";
import { Subscription } from "../entities/Subscription";
import { PaymentMethod } from "../entities/PaymentMethod";
import { Payment } from "../entities/Payment";
import { writeAuditLog } from "../services/audit";

const planRepo = () => AppDataSource.getRepository(Plan);
const subscriptionRepo = () => AppDataSource.getRepository(Subscription);
const paymentMethodRepo = () => AppDataSource.getRepository(PaymentMethod);
const payRepo = () => AppDataSource.getRepository(Payment);

function addMonths(d: Date, months = 1) {
  const add = new Date(d);
  add.setMonth(add.getMonth() + months);
  return add;
}

export const BillingController = {
  async getMyBilling(req: Request, res: Response) {
    const userId = (req as any).auth?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const role = (req as any).auth?.role ?? null;
    const [plans, subscriptions, methods, payments] = await Promise.all([
      planRepo().find({ order: { price: "ASC" as any } }),
      subscriptionRepo().find({
        where: { userId, active: true },
        order: { createdAt: "DESC" as any },
        take: 1,
      }),
      paymentMethodRepo().find({
        where: { userId },
        order: { createdAt: "DESC" as any },
      }),
      payRepo().find({
        where: { userId },
        order: { createdAt: "DESC" as any },
        take: 50,
      }),
    ]);

    const activeSubscription = subscriptions[0] ?? null;

    const effectivePlanId = activeSubscription?.planId ?? "free";

    const currentPlan =
      plans.find((p) => p.id === effectivePlanId) ?? null;

    return res.json({
      role,
      plans,
      subscription: activeSubscription,
      plan: currentPlan,
      paymentMethods: methods,
      payments,
      isActive: !!activeSubscription?.active,

      documentLimits: {
        type: currentPlan?.features?.document_limit_type ?? "lifetime",
        limit: currentPlan?.features?.document_limit ?? null,
      },
    });
  },

  async addPaymentMethod(req: Request, res: Response) {
    const userId = (req as any).auth?.userId as string | undefined;
    const orgId = (req as any).auth?.organizationId as string | undefined;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    console.log("[billing] headers content-type:", req.headers["content-type"]);
    console.log("[billing] body:", req.body);

    const { cardNumber, expMonth, expYear, brand } = req.body ?? {};

    const last4 = String(cardNumber ?? "").replace(/\s+/g, "").slice(-4);
    const expMonthNum = Number(expMonth);
    const expYearNum = Number(expYear);

    if (!last4 || !Number.isFinite(expMonthNum) || !Number.isFinite(expYearNum)) {
      return res.status(400).json({ error: "Missing card fields" });
    }

    await paymentMethodRepo().update({ userId }, { isDefault: false });

    const paymentMethod = paymentMethodRepo().create({
      userId,
      brand: String(brand ?? "visa"),
      last4,
      expMonth: expMonthNum,
      expYear: expYearNum,
      isDefault: true,
    });

    await paymentMethodRepo().save(paymentMethod);

    if (orgId) {
      await writeAuditLog({
        orgId,
        actorUserId: userId,
        action: "billing.payment.method.added",
        category: "Billing",
        severity: "info",
        description: "Payment method added",
        details: {
          paymentMethodId: paymentMethod.id,
          last4: paymentMethod.last4,
          brand: paymentMethod.brand,
        },
        ip: req.ip,
        userAgent: req.get("user-agent") ?? null,
      });
    }

    return res.status(201).json({ paymentMethod });
  },

  async pretendCheckout(req: Request, res: Response) {
    const userId = (req as any).auth?.userId as string | undefined;
    const orgId = (req as any).auth?.organizationId as string | undefined;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { planId } = req.body ?? {};

    const plan = await planRepo().findOne({ where: { id: planId } });
    if (!plan) return res.status(404).json({ error: "Plan not found" });

    const defaultPaymentMethod = await paymentMethodRepo().findOne({
      where: { userId, isDefault: true },
    });
    if (!defaultPaymentMethod) return res.status(400).json({ error: "Add a payment method first" });

    await subscriptionRepo().update(
      { userId, active: true },
      { active: false, status: "canceled" }
    );

    const now = new Date();
    const subscription = subscriptionRepo().create({
      userId,
      planId: plan.id,
      active: true,
      status: "active",
      currentPeriodStart: now,
      currentPeriodEnd: addMonths(now, 1),
    });
    await subscriptionRepo().save(subscription);

    const invoice = `inv_${now.getTime()}`;
    const payment = payRepo().create({
      userId,
      subscriptionId: subscription.id,
      invoice,
      amount: plan.price,
      currency: plan.currency,
      status: "paid",
    });
    await payRepo().save(payment);

    if (orgId) {
      await writeAuditLog({
        orgId,
        actorUserId: userId,
        action: "billing.pretendpayment",
        category: "Billing",
        severity: "info",
        description: "Subscription activated (mock checkout)",
        details: {
          subscriptionId: subscription.id,
          planId: plan.id,
          invoice,
          amount: plan.price,
        },
        ip: req.ip,
        userAgent: req.get("user-agent") ?? null,
      });
    }

    return res.json({ ok: true, subscription, payment });
  },

  async deletePaymentMethod(req: Request, res: Response) {
    const userId = (req as any).auth?.userId as string | undefined;
    const orgId = (req as any).auth?.organizationId as string | undefined;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const id = String(req.params.id || "");
    if (!id) return res.status(400).json({ error: "Missing id" });

    const paymentMethod = await paymentMethodRepo().findOne({ where: { id, userId } });
    if (!paymentMethod) return res.status(404).json({ error: "Not found" });

    await paymentMethodRepo().remove(paymentMethod);

    const rest = await paymentMethodRepo().find({
      where: { userId },
      order: { createdAt: "DESC" as any },
    });

    if (rest.length) {
      await paymentMethodRepo().update({ id: rest[0].id }, { isDefault: true });
    }

    if (orgId) {
      await writeAuditLog({
        orgId,
        actorUserId: userId,
        action: "billing.payment.method.deleted",
        category: "Billing",
        severity: "info",
        description: "Payment method deleted",
        details: { paymentMethodId: id, last4: paymentMethod.last4, brand: paymentMethod.brand },
        ip: req.ip,
        userAgent: req.get("user-agent") ?? null,
      });
    }

    return res.status(204).send();
  },

  async cancelSubscription(req: Request, res: Response) {
    const userId = (req as any).auth?.userId as string | undefined;
    const orgId = (req as any).auth?.organizationId as string | undefined;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const subscription = await subscriptionRepo().findOne({
      where: { userId, active: true },
    });
    if (!subscription) return res.json({ ok: true });

    subscription.active = false;
    subscription.status = "canceled";
    await subscriptionRepo().save(subscription);

    if (orgId) {
      await writeAuditLog({
        orgId,
        actorUserId: userId,
        action: "billing.subscription.canceled",
        category: "Billing",
        severity: "info",
        description: "Subscription canceled",
        details: { subscriptionId: subscription.id, planId: subscription.planId },
        ip: req.ip,
        userAgent: req.get("user-agent") ?? null,
      });
    }

    return res.json({ ok: true });
  },
};