import "express";

declare module "express-serve-static-core" {
  interface Request {
    auth?: {
      userId: string;
      email: string;
      role?: string | null;
      organizationId?: string | null;
    };
  }
}
