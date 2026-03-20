import { Router } from "express";
import { z } from "zod";
import { sendContactFormEmail } from "../services/email";
const router = Router();

const ContactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  message: z.string().trim().min(10).max(5000),
});

router.post("/contact", async (req, res) => {
  const parsed = ContactSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const { name, email, message } = parsed.data;
  const userId = (req as any).user?.id ?? null;
  const orgId = (req as any).user?.organizationId ?? null;

  await sendContactFormEmail({ name, email, message });

  return res.status(200).json({ ok: true });
});

export default router;
