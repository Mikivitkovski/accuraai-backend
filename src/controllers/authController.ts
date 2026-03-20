import { Request, Response } from "express";
import type { CookieOptions } from "express";
import { AppDataSource } from "../db/dataSource";
import { User, UserRole } from "../entities/User";
import { Organization } from "../entities/Organization";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { deleteOrgIfEmpty } from "../services/orgCleanup";
import multer from "multer";
import {
  uploadUserAvatar,
  getUserAvatarUrl,
  deleteKey,
  deleteUserStorage,
} from "../services/s3";
import {
  sendMemberInviteEmail,
  sendEmailVerificationEmail,
} from "../services/email";
import * as speakeasy from "speakeasy";
import { writeAuditLog } from "../services/audit";

const userRepo = () => AppDataSource.getRepository(User);
const organizationRepo = () => AppDataSource.getRepository(Organization);

const JWT_SECRET = env.JWT_SECRET!;
const JWT_EXPIRES = "3h";

const AUTH_COOKIE_NAME = "auth";
const isProd =
  process.env.VERCEL === "1" || process.env.NODE_ENV === "production";

const authCookieOpts: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: "lax",
  path: "/",
  maxAge: 3 * 60 * 60 * 1000,
};

const APP_URL = env.APP_URL ?? "";
const FRONTEND_URL = env.FRONTEND_URL ?? "";

function signToken(
  u: Pick<User, "id" | "email" | "organizationId" | "role">
) {
  return jwt.sign(
    {
      sub: u.id,
      email: u.email,
      organizationId: u.organizationId ?? null,
      role: u.role ?? null,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

function generateEmailCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function issueEmailVerificationCode(user: User) {
  const code = generateEmailCode();
  const hash = await bcrypt.hash(code, 12);

  user.emailVerifyCodeHash = hash;
  user.emailVerifyCodeExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await userRepo().save(user);

  await sendEmailVerificationEmail({
    to: user.email,
    name: user.name,
    code,
  });
}

function isStrongPassword(password: string): boolean {
  if (!password) return false;

  if (password.length < 8) return false;

  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  return hasLower && hasUpper && hasDigit && hasSymbol;
}

function normalizeEmail(e: string) {
  return String(e || "").toLowerCase().trim();
}

async function issueEmailChangeCode(user: User, newEmail: string) {
  const code = generateEmailCode();
  const hash = await bcrypt.hash(code, 12);

  user.pendingEmail = newEmail;
  user.emailChangeCodeHash = hash;
  user.emailChangeCodeExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await userRepo().save(user);

  await sendEmailVerificationEmail({
    to: newEmail,
    name: user.name,
    code,
  });
}

function setAuthCookie(res: Response, token: string) {
  res.cookie(AUTH_COOKIE_NAME, token, authCookieOpts);
}

export async function createUser(req: Request, res: Response) {
  try {
    const orgId = (req as any).orgId as string | undefined;
    if (!orgId) return res.status(403).json({ error: "Forbidden" });

    const email = (req.body.email as string).toLowerCase().trim();
    const exists = await userRepo().findOne({ where: { email } });
    if (exists) return res.status(409).json({ error: "Email already exists" });

    const { name, password, isReviewer } = req.body as {
      name: string;
      password: string;
      isReviewer?: boolean;
    };

    if (!password) {
      return res.status(400).json({ error: "Password is required" });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        error:
          "Password is too weak. It must be at least 8 characters long and include at least one lowercase letter, one uppercase letter, one number, and one symbol.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const role: UserRole = isReviewer ? "reviewer" : "member";

    const user = userRepo().create({
      email,
      name,
      passwordHash,
      organizationId: orgId,
      role,
      emailVerifiedAt: null,
    } as Partial<User>);

    await userRepo().save(user);

    const actorUserId = (req as any).auth?.userId ?? null;

    await writeAuditLog({
      orgId,
      actorUserId,
      action: "org.member.invited",
      category: "Organization",
      severity: "info",
      description: `Member invited: ${user.email}`,
      details: {
        invitedUserId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        via: "createUser",
      },
      ip: req.ip,
      userAgent: req.get("user-agent") ?? null,
    });

    let orgName: string | null = null;
    try {
      const org = await organizationRepo().findOneBy({ id: orgId });
      orgName = org?.name ?? null;
    } catch { }

    try {
      await sendMemberInviteEmail({
        to: email,
        memberName: name,
        orgName,
        tempPassword: password,
      });
    } catch (e) {
      console.error("sendMemberInviteEmail failed:", e);
    }

    return res.status(201).json({
      id: user.id,
      email: user.email,
      name: user.name,
      organizationId: user.organizationId,
      role: user.role,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      firstLogin: user.firstLogin,
    });
  } catch (e) {
    console.error("createUser failed:", e);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}


export async function listOrgMembers(req: Request, res: Response) {
  try {
    const orgId = (req as any).orgId as string | undefined;
    if (!orgId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const members = await userRepo().find({
      where: { organizationId: orgId, role: "member" },
      order: { createdAt: "ASC" },
      select: ["id", "email", "name", "role", "createdAt", "updatedAt"],
    });

    return res.json(members);
  } catch (e) {
    console.error("listOrgMembers failed:", e);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function listUsers(req: Request, res: Response) {
  const authUserId = (req as any).auth?.userId as string | undefined;
  const me = await userRepo().findOne({ where: { id: authUserId } });
  if (!me) return res.status(401).json({ error: "Unauthorized" });

  if (me.role === "owner" && me.organizationId) {
    const users = await userRepo().find({
      where: { organizationId: me.organizationId },
    });
    return res.json(users);
  }

  return res.json([me]);
}

export async function getUser(req: Request, res: Response) {
  const target = await userRepo().findOne({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: "Not found" });

  const authUserId = (req as any).auth?.userId as string | undefined;
  const me = await userRepo().findOne({ where: { id: authUserId } });
  if (!me) return res.status(401).json({ error: "Unauthorized" });

  if (me.role === "owner" && me.organizationId === target.organizationId) {
    return res.json(target);
  }

  if (me.id === target.id) return res.json(target);

  return res.status(403).json({ error: "Forbidden" });
}

export async function deleteUser(req: Request, res: Response) {
  const target = await userRepo().findOneBy({ id: req.params.id });
  if (!target) return res.status(404).json({ error: "Not found" });

  const authUserId = (req as any).auth?.userId as string | undefined;
  const me = await userRepo().findOne({ where: { id: authUserId } });
  if (!me) return res.status(401).json({ error: "Unauthorized" });

  const sameOrg =
    !!me.organizationId && me.organizationId === target.organizationId;

  if (me.role !== "owner" || !sameOrg) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (target.role === "owner") {
    return res
      .status(403)
      .json({ error: "Cannot delete an organization owner" });
  }

  const userId = target.id;
  const orgId = target.organizationId;

  if (!orgId) {
    return res.status(400).json({ error: "User has no organization" });
  }

  const removedSnapshot = {
    id: target.id,
    email: target.email,
    name: target.name,
    role: target.role,
  };
  const actorUserId = (req as any).auth?.userId ?? null;

  await userRepo().remove(target);

  await writeAuditLog({
    orgId,
    actorUserId,
    action: "org.member.removed",
    category: "Organization",
    severity: "warning",
    description: `Member removed: ${removedSnapshot.email}`,
    details: {
      removed: removedSnapshot,
    },
    ip: req.ip,
    userAgent: req.get("user-agent") ?? null,
  });

  try {
    await deleteOrgIfEmpty(orgId);
  } catch (e) {
    console.error("deleteOrgIfEmpty failed after deleteUser:", e);
  }

  try {
    await deleteUserStorage(userId);
  } catch (e) {
    console.error("deleteUserStorage failed:", e);
  }

  return res.status(204).send();
}

export async function linkMyOrganization(req: Request, res: Response) {
  try {
    const userId = (req as any).auth?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const organizationId = String((req.body as any)?.organizationId ?? "").trim();
    if (!organizationId) {
      return res.status(400).json({ error: "organizationId is required" });
    }

    const me = await userRepo().findOne({ where: { id: userId } });
    if (!me) return res.status(404).json({ error: "User not found" });

    const org = await organizationRepo().findOne({ where: { id: organizationId } });
    if (!org) return res.status(404).json({ error: "Organization not found" });

    if (me.organizationId && me.organizationId === organizationId) {
      return res.status(200).json({ ok: true, organizationId });
    }

    if (me.organizationId && me.organizationId !== organizationId) {
      return res.status(409).json({ error: "User already belongs to another organization" });
    }

    me.organizationId = organizationId;

    if (!me.role || me.role === "member") {
      me.role = "owner" as UserRole;
    }

    await userRepo().save(me);

    try {
      await writeAuditLog({
        orgId: organizationId,
        actorUserId: me.id,
        action: "user.organization.linked",
        category: "Organization",
        severity: "info",
        description: "User linked to organization during onboarding.",
        details: { userId: me.id, email: me.email },
        ip: req.ip,
        userAgent: req.get("user-agent") ?? null,
      });
    } catch { }

    return res.status(200).json({ ok: true, organizationId });
  } catch (e) {
    console.error("linkMyOrganization failed:", e);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function updateUser(req: Request, res: Response) {
  const target = await userRepo().findOneBy({ id: req.params.id });
  if (!target) return res.status(404).json({ error: "Not found" });

  const authUserId = (req as any).auth?.userId as string | undefined;
  const me = await userRepo().findOne({ where: { id: authUserId } });
  if (!me) return res.status(401).json({ error: "Unauthorized" });

  const sameOrg =
    !!me.organizationId && me.organizationId === target.organizationId;
  const isSelf = me.id === target.id;
  const editingOther = !isSelf;

  if (editingOther) {
    if (!sameOrg || me.role !== "owner") {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (target.role === "owner") {
      return res
        .status(403)
        .json({ error: "Cannot modify another organization owner" });
    }
  }

  const orgId = target.organizationId;
  if (!orgId) {
    return res.status(400).json({ error: "User has no organization" });
  }

  const actorUserId = me.id;

  const { email, name } = (req.body ?? {}) as { email?: string; name?: string };

  const changes: any[] = [];

  if (typeof name !== "undefined" && name !== target.name) {
    changes.push({ field: "name", from: target.name, to: name });
    target.name = name;
  }

  if (typeof email !== "undefined") {
    const nextEmail = normalizeEmail(email);
    const currentEmail = normalizeEmail(target.email);

    if (nextEmail && nextEmail !== currentEmail) {
      if (
        target.pendingEmail &&
        normalizeEmail(target.pendingEmail) === nextEmail
      ) {
        return res.status(202).json({
          ok: true,
          emailChange: "pending",
          pendingEmail: target.pendingEmail,
        });
      }

      const dup = await userRepo().findOne({ where: { email: nextEmail } });
      if (dup) return res.status(409).json({ error: "Email already exists" });

      try {
        await issueEmailChangeCode(target, nextEmail);
      } catch (e) {
        console.error("issueEmailChangeCode failed:", e);
        return res
          .status(500)
          .json({ error: "Failed to send verification code" });
      }

      try {
        await writeAuditLog({
          orgId,
          actorUserId,
          action: "user.profile.email.change.requested",
          category: "User",
          severity: "info",
          description: "User requested email change (verification required).",
          details: { from: target.email, to: nextEmail },
          ip: req.ip,
          userAgent: req.get("user-agent") ?? null,
        });
      } catch { }

      if (changes.some((c) => c.field === "name")) {
        await userRepo().save(target);
      }

      return res.status(202).json({
        ok: true,
        emailChange: "pending",
        pendingEmail: nextEmail,
      });
    }
  }

  await userRepo().save(target);

  try {
    for (const c of changes) {
      if (c.field !== "name") continue;

      await writeAuditLog({
        orgId,
        actorUserId,
        action: "user.profile.name.updated",
        category: "User",
        severity: "info",
        description: "User name updated",
        details: { from: c.from, to: c.to },
        ip: req.ip,
        userAgent: req.get("user-agent") ?? null,
      });
    }
  } catch (e) {
    console.warn("audit log (user profile update) failed:", e);
  }

  return res.json(target);
}


export async function transferOwnership(req: Request, res: Response) {
  try {
    const orgId = (req as any).orgId as string | undefined;
    const authUserId = (req as any).auth?.userId as string | undefined;

    if (!orgId || !authUserId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const targetUserId = req.params.id;
    if (!targetUserId) {
      return res.status(400).json({ error: "Target user id is required" });
    }

    const currentOwner = await userRepo().findOne({
      where: { organizationId: orgId, role: "owner" },
    });
    if (!currentOwner) {
      return res
        .status(400)
        .json({ error: "No owner found for this organization" });
    }

    if (currentOwner.id !== authUserId) {
      return res
        .status(403)
        .json({ error: "Only the current owner can transfer ownership" });
    }

    const targetUser = await userRepo().findOne({
      where: { id: targetUserId, organizationId: orgId },
    });
    if (!targetUser) {
      return res
        .status(404)
        .json({ error: "Target user not found in this organization" });
    }

    if (targetUser.id === currentOwner.id) {
      return res
        .status(400)
        .json({ error: "Cannot transfer ownership to yourself" });
    }

    currentOwner.role = "member" as UserRole;

    targetUser.role = "owner" as UserRole;

    await userRepo().save([currentOwner, targetUser]);

    await writeAuditLog({
      orgId,
      actorUserId: authUserId,
      action: "org.member.role_changed",
      category: "Organization",
      severity: "info",
      description: "Member roles updated due to ownership transfer.",
      details: {
        changes: [
          { userId: currentOwner.id, email: currentOwner.email, from: "owner", to: "member" },
          { userId: targetUser.id, email: targetUser.email, from: "member", to: "owner" },
        ],
      },
      ip: req.ip,
      userAgent: req.get("user-agent") ?? null,
    });

    return res.status(200).json({
      ok: true,
      organizationId: orgId,
      previousOwnerId: currentOwner.id,
      newOwnerId: targetUser.id,
      previousOwnerRole: currentOwner.role,
      newOwnerRole: targetUser.role,
    });
  } catch (e) {
    console.error("transferOwnership failed:", e);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}


export async function register(req: Request, res: Response) {
  const email = (req.body.email as string).toLowerCase().trim();
  const { name, password, organizationId } = req.body as {
    name: string;
    password: string;
    organizationId?: string | null;
  };

  const exists = await userRepo().findOne({ where: { email } });
  if (exists) return res.status(409).json({ error: "Email already exists" });

  if (!password) {
    return res.status(400).json({ error: "Password is required" });
  }

  if (!isStrongPassword(password)) {
    return res.status(400).json({
      error:
        "Password is too weak. It must be at least 8 characters long and include at least one lowercase letter, one uppercase letter, one number, and one symbol.",

    });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  let role: UserRole = "member";

  if (organizationId) {
    const count = await userRepo().count({ where: { organizationId } });
    if (count === 0) {
      role = "owner";
    }
  }

  const user = userRepo().create({
    email,
    name,
    passwordHash,
    organizationId: organizationId ?? undefined,
    role,
  } as Partial<User>);

  await userRepo().save(user);

  try {
    await issueEmailVerificationCode(user as User);
  } catch (e) {
    console.error("issueEmailVerificationCode failed:", e);
  }

  return res.status(201).json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
  });
}

export async function confirmEmailChange(req: Request, res: Response) {
  const userId = (req as any).auth?.userId as string | undefined;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const code = String(req.body?.code ?? "").trim();
  if (!code) return res.status(400).json({ error: "Code is required" });

  const user = await userRepo()
    .createQueryBuilder("u")
    .addSelect("u.emailChangeCodeHash")
    .where("u.id = :id", { id: userId })
    .getOne();

  if (!user) return res.status(404).json({ error: "Not found" });

  if (!user.pendingEmail || !user.emailChangeCodeHash || !user.emailChangeCodeExpiresAt) {
    return res.status(400).json({ error: "No email change in progress" });
  }

  if (user.emailChangeCodeExpiresAt.getTime() < Date.now()) {
    return res.status(400).json({ error: "Code expired" });
  }

  const ok = await bcrypt.compare(code, user.emailChangeCodeHash);
  if (!ok) return res.status(400).json({ error: "Invalid code" });

  const nextEmail = normalizeEmail(user.pendingEmail);
  const dup = await userRepo().findOne({ where: { email: nextEmail } });
  if (dup && dup.id !== user.id) return res.status(409).json({ error: "Email already exists" });

  const oldEmail = user.email;

  user.email = nextEmail;
  user.emailVerifiedAt = new Date();
  user.pendingEmail = null;
  user.emailChangeCodeHash = null;
  user.emailChangeCodeExpiresAt = null;

  await userRepo().save(user);

  const authToken = signToken({
    id: user.id,
    email: user.email,
    organizationId: user.organizationId,
    role: user.role,
  } as User);
  setAuthCookie(res, authToken);

  try {
    if (user.organizationId) {
      await writeAuditLog({
        orgId: user.organizationId,
        actorUserId: user.id,
        action: "user.profile.email.updated",
        category: "User",
        severity: "info",
        description: "User email updated (verified).",
        details: { from: oldEmail, to: user.email },
        ip: req.ip,
        userAgent: req.get("user-agent") ?? null,
      });
    }
  } catch { }

  return res.status(200).json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name },
  });
}

export async function resendEmailChangeCode(req: Request, res: Response) {
  const userId = (req as any).auth?.userId as string | undefined;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const user = await userRepo().findOne({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: "Not found" });

  if (!user.pendingEmail) return res.status(400).json({ error: "No email change in progress" });

  await issueEmailChangeCode(user as User, normalizeEmail(user.pendingEmail));
  return res.status(204).send();
}

export async function login(req: Request, res: Response) {
  const email = (req.body.email as string).toLowerCase().trim();
  const { password } = req.body as { password: string };

  const user = await userRepo()
    .createQueryBuilder("u")
    .addSelect("u.passwordHash")
    .where("lower(u.email) = lower(:email)", { email })
    .getOne();

  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  if (!user.emailVerifiedAt) {
    return res.status(403).json({
      error: "Email not verified",
      code: "EMAIL_NOT_VERIFIED",
    });
  }

  const org = user.organizationId
    ? await organizationRepo().findOne({ where: { id: user.organizationId } })
    : null;

  const orgRequiresMfa = !!org?.requireMfa;
  const mfaRequired = user.mfaEnabled || orgRequiresMfa;

  if (mfaRequired) {
    const mfaToken = jwt.sign(
      { sub: user.id, type: "mfa" },
      JWT_SECRET,
      { expiresIn: "10m" }
    );

    return res.json({
      mfaRequired: true,
      mfaToken,
      needsEnrollment: !user.mfaEnabled,
    });
  }

  const token = signToken({
    id: user.id,
    email: user.email,
    organizationId: user.organizationId,
    role: user.role,
  } as User);
  setAuthCookie(res, token);

  if (user.organizationId) {
    await writeAuditLog({
      orgId: user.organizationId,
      actorUserId: user.id,
      action: "auth.login",
      category: "Authentication",
      severity: "info",
      description: `User logged in: ${user.email}`,
      details: {
        email: user.email,
        method: "password",
        mfaUsed: false,
      },
      ip: req.ip,
      userAgent: req.get("user-agent") ?? null,
    });
  }

  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      organizationId: user.organizationId,
      role: user.role,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      firstLogin: user.firstLogin,
    },
  });
}

export async function resendVerificationEmailPublic(req: Request, res: Response) {
  const email = String(req.body?.email ?? "").toLowerCase().trim();
  if (!email) return res.status(400).json({ error: "Email is required" });

  const user = await userRepo().findOne({ where: { email } });

  if (!user) return res.status(204).send();

  if (user.emailVerifiedAt) return res.status(204).send();

  try {
    await issueEmailVerificationCode(user as User);
  } catch (e) {
    console.error("resendVerificationEmailPublic failed:", e);
  }

  return res.status(204).send();
}


export async function completeMfaLogin(req: Request, res: Response) {
  console.log("MFA DEBUG HIT /login/mfa-complete");
  console.log("MFA DEBUG BODY =", req.body);

  const { mfaToken, code } = req.body as {
    mfaToken?: string;
    code?: string | number;
  };

  if (!mfaToken || typeof code === "undefined" || code === null) {
    return res.status(400).json({ error: "Missing mfaToken or code" });
  }

  let payload: any;
  try {
    payload = jwt.verify(mfaToken, JWT_SECRET);
  } catch (e) {
    console.error("MFA JWT verify failed:", e);
    return res.status(400).json({ error: "Invalid or expired MFA token" });
  }

  if (payload.type !== "mfa" || !payload.sub) {
    return res.status(400).json({ error: "Invalid MFA token type" });
  }

  const user = await userRepo()
    .createQueryBuilder("u")
    .addSelect("u.mfaSecret")
    .where("u.id = :id", { id: payload.sub })
    .getOne();

  if (!user || !user.mfaSecret) {
    return res.status(400).json({ error: "MFA not set up for user" });
  }

  const tokenStr = String(code).trim();

  const ok = speakeasy.totp.verify({
    secret: user.mfaSecret,
    encoding: "base32",
    token: tokenStr,
    window: 1,
  });

  console.log("MFA DEBUG VERIFY RESULT =", ok);

  if (!ok) {
    return res.status(401).json({ error: "Invalid code" });
  }

  const authToken = signToken({
    id: user.id,
    email: user.email,
    organizationId: user.organizationId,
    role: user.role,
  } as User);

  setAuthCookie(res, authToken);

  if (user.organizationId) {
    await writeAuditLog({
      orgId: user.organizationId,
      actorUserId: user.id,
      action: "auth.login",
      category: "Authentication",
      severity: "info",
      description: `User logged in (MFA): ${user.email}`,
      details: {
        email: user.email,
        method: "mfa",
        mfaUsed: true,
      },
      ip: req.ip,
      userAgent: req.get("user-agent") ?? null,
    });
  }

  return res.json({
    token: authToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      organizationId: user.organizationId,
      role: user.role,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      firstLogin: user.firstLogin,
    },
  });
}

export async function logout(req: Request, res: Response) {
  const base = {
    httpOnly: true,
    path: "/",
    domain: "dev-api.accuraai.cc",
  } as const;

  try {
    const authUserId = (req as any).auth?.userId as string | undefined;

    let orgId =
      ((req as any).orgId as string | undefined) ??
      ((req as any).auth?.organizationId as string | undefined);

    let email: string | null = null;

    if ((!orgId || !email) && authUserId) {
      try {
        const me = await userRepo().findOne({
          where: { id: authUserId },
          select: ["email", "organizationId"],
        });

        if (!orgId) orgId = me?.organizationId ?? undefined;
        email = me?.email ?? null;
      } catch {
      }
    }

    res.clearCookie(AUTH_COOKIE_NAME, { ...base, sameSite: "lax", secure: false });
    res.clearCookie(AUTH_COOKIE_NAME, { ...base, sameSite: "none", secure: true });

    if (orgId) {
      try {
        await writeAuditLog({
          orgId,
          actorUserId: authUserId ?? null,
          action: "auth.logout",
          category: "Authentication",
          severity: "info",
          description: email ? `User logged out: ${email}` : "User logged out",
          details: {
            email: email ?? null,
          },
          ip: req.ip,
          userAgent: req.get("user-agent") ?? null,
        });
      } catch (e) {
        console.error("audit logout failed:", e);
      }
    }

    return res.status(204).send();
  } catch (e) {
    console.error("logout failed:", e);

    res.clearCookie(AUTH_COOKIE_NAME, { ...base, sameSite: "lax", secure: false });
    res.clearCookie(AUTH_COOKIE_NAME, { ...base, sameSite: "none", secure: true });

    return res.status(204).send();
  }
}



export async function me(req: Request, res: Response) {
  const userId = (req as any).auth?.userId as string;

  const user = await userRepo().findOne({
    where: { id: userId },
    select: [
      "id",
      "email",
      "name",
      "organizationId",
      "role",
      "emailVerifiedAt",
      "createdAt",
      "updatedAt",
      "mfaEnabled",
      "avatarPath",
      "firstLogin",
    ],
  });

  if (!user) return res.status(404).json({ error: "Not found" });
  return res.json(user);
}

export async function verifyEmailCode(req: Request, res: Response) {
  const email = String(req.body?.email ?? "").toLowerCase().trim();
  const code = String(req.body?.code ?? "").trim();

  if (!email || !code) {
    return res.status(400).json({ error: "Email and code are required" });
  }

  const user = await userRepo()
    .createQueryBuilder("u")
    .addSelect("u.emailVerifyCodeHash")
    .where("lower(u.email) = lower(:email)", { email })
    .getOne();

  if (!user) return res.status(400).json({ error: "Invalid code" });

  if (user.emailVerifiedAt) {
    return res.status(200).json({ ok: true });
  }

  if (!user.emailVerifyCodeHash || !user.emailVerifyCodeExpiresAt) {
    return res.status(400).json({ error: "Invalid code" });
  }

  if (user.emailVerifyCodeExpiresAt.getTime() < Date.now()) {
    return res.status(400).json({ error: "Code expired" });
  }

  const ok = await bcrypt.compare(code, user.emailVerifyCodeHash);
  if (!ok) return res.status(400).json({ error: "Invalid code" });

  user.emailVerifiedAt = new Date();
  user.emailVerifyCodeHash = null;
  user.emailVerifyCodeExpiresAt = null;
  await userRepo().save(user);

  return res.status(200).json({ ok: true });
}


export async function resendVerificationEmail(req: Request, res: Response) {
  const userId = (req as any).auth?.userId as string | undefined;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const user = await userRepo().findOne({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: "Not found" });

  if (user.emailVerifiedAt) {
    return res.status(400).json({ error: "Email already verified" });
  }

  try {
    await issueEmailVerificationCode(user as User);
    return res.status(204).send();
  } catch (e) {
    console.error("resendVerificationEmail failed:", e);
    return res.status(500).json({ error: "Internal Server Error" });
  }

}

export async function completeOnboarding(req: Request, res: Response) {
  const userId = (req as any).auth?.userId as string | undefined;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  await userRepo().update({ id: userId }, { firstLogin: false });

  const user = await userRepo().findOne({
    where: { id: userId },
    select: ["id", "email", "name", "organizationId", "role", "firstLogin", "createdAt", "updatedAt"],
  });

  return res.status(200).json({ ok: true, user });
}


export async function beginMfaSetup(req: Request, res: Response) {
  const userId = (req as any).auth?.userId as string | undefined;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const user = await userRepo().findOne({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: "Not found" });

  const secret = speakeasy.generateSecret({
    length: 20,
    name: `Accuraai (${user.email})`,
  });

  user.mfaTempSecret = secret.base32;
  await userRepo().save(user);

  return res.json({
    otpauthUrl: secret.otpauth_url,
    secretBase32: secret.base32,
  });
}

export async function confirmMfaSetup(req: Request, res: Response) {
  const userId = (req as any).auth?.userId as string | undefined;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { token } = req.body as { token: string };

  const user = await userRepo()
    .createQueryBuilder("u")
    .addSelect("u.mfaTempSecret")
    .where("u.id = :id", { id: userId })
    .getOne();

  if (!user || !user.mfaTempSecret) {
    return res.status(400).json({ error: "No MFA setup in progress" });
  }

  const ok = speakeasy.totp.verify({
    secret: user.mfaTempSecret!,
    encoding: "base32" as speakeasy.Encoding,
    token,
    window: 1,
  });


  if (!ok) {
    return res.status(400).json({ error: "Invalid code" });
  }

  user.mfaSecret = user.mfaTempSecret;
  user.mfaTempSecret = null;
  user.mfaEnabled = true;

  await userRepo().save(user);
  return res.status(204).send();
}

export async function disableMfa(req: Request, res: Response) {
  const userId = (req as any).auth?.userId as string | undefined;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const user = await userRepo().findOne({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: "Not found" });

  user.mfaEnabled = false;
  user.mfaSecret = null;
  user.mfaTempSecret = null;

  await userRepo().save(user);
  return res.status(204).send();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const uploadAvatar = [
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const user = await userRepo().findOneBy({ id });
      if (!user) return res.status(404).json({ error: "Not found" });

      const authUserId = (req as any).auth?.userId as string | undefined;
      if (authUserId && authUserId !== id) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ error: "file is required" });

      if ((user as any).avatarPath) {
        try {
          await deleteKey((user as any).avatarPath as string);
        } catch { }
      }

      const uploaded = await uploadUserAvatar(
        id,
        file.originalname,
        file.buffer,
        file.mimetype
      );

      (user as any).avatarPath = uploaded.key;
      await userRepo().save(user);

      try {
        const orgId = user.organizationId;
        const actorUserId = (req as any).auth?.userId ?? null;

        if (orgId) {
          await writeAuditLog({
            orgId,
            actorUserId,
            action: "user.avatar.uploaded",
            category: "User",
            severity: "info",
            description: "User avatar uploaded.",
            details: {
              filename: file.originalname,
            },
            ip: req.ip,
            userAgent: req.get("user-agent") ?? null,
          });
        }
      } catch (e) {
        console.warn("audit log (avatar upload) failed:", e);
      }

      return res.status(201).json({ ok: true, file: { key: uploaded.key } });
    } catch (e) {
      console.error("uploadAvatar failed:", e);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  },
];

export const getAvatarUrl = async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = await userRepo().findOneBy({ id });
  if (!user) return res.status(404).json({ error: "Not found" });
  if (!(user as any).avatarPath) {
    return res.status(200).json({ url: null });
  }

  const url = await getUserAvatarUrl((user as any).avatarPath as string);
  return res.json({ url });
};

export const deleteAvatar = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = await userRepo().findOneBy({ id });
    if (!user) return res.status(404).json({ error: "Not found" });

    const authUserId = (req as any).auth?.userId as string | undefined;
    if (authUserId && authUserId !== id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const orgId = user.organizationId;
    const actorUserId = (req as any).auth?.userId ?? null;

    const key = (user as any).avatarPath as string | null;
    const filename = key ? decodeURIComponent(key.split("/").pop() || "") : null;

    if (key) {
      try {
        await deleteKey(key);
      } catch { }
      (user as any).avatarPath = null;
      await userRepo().save(user);

      try {
        if (orgId) {
          await writeAuditLog({
            orgId,
            actorUserId,
            action: "user.avatar.deleted",
            category: "User",
            severity: "info",
            description: "User avatar deleted.",
            details: {
              filename,
            },
            ip: req.ip,
            userAgent: req.get("user-agent") ?? null,
          });
        }
      } catch (e) {
        console.warn("audit log (avatar delete) failed:", e);
      }
    }

    return res.status(204).send();
  } catch (e) {
    console.error("deleteAvatar failed:", e);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
