import { Router } from "express";
import { validate } from "../middleware/validate";
import { RegisterSchema, LoginSchema } from "../schemas/authSchema";
import {
  register,
  login,
  logout,
  me,
  resendVerificationEmail,
  beginMfaSetup,
  confirmMfaSetup,
  disableMfa,
  completeMfaLogin,
  confirmEmailChange,
  resendEmailChangeCode,
} from "../controllers/authController";
import { authenticate } from "../middleware/auth";
import { completeOnboarding } from "../controllers/authController";
import { resendVerificationEmailPublic } from "../controllers/authController";
import { verifyEmailCode } from "../controllers/authController";

const router = Router();

router.get("/__ping", (_req, res) => res.type("text").send("ok"));

router.post("/register", validate(RegisterSchema), register);
router.post("/login", validate(LoginSchema), login);

router.get("/me", authenticate, me);
router.post("/email-change/confirm", authenticate, confirmEmailChange);
router.post("/email-change/resend", authenticate, resendEmailChangeCode);

router.post("/verify-email-code", verifyEmailCode);
router.post("/resend-verification-public", resendVerificationEmailPublic);

router.post("/resend-verification", authenticate, resendVerificationEmail);
router.post("/onboarding/complete", authenticate, completeOnboarding);

router.post("/logout", authenticate, logout);

router.post("/mfa/begin", authenticate, beginMfaSetup);
router.post("/mfa/confirm", authenticate, confirmMfaSetup);
router.post("/mfa/disable", authenticate, disableMfa);

router.post("/login/mfa-complete", completeMfaLogin);

export default router;
