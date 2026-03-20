import type { Request, Response, NextFunction } from "express";

export function auditContext(req: Request, _res: Response, next: NextFunction) {
    const xf = req.headers["x-forwarded-for"];
    const ip =
        (Array.isArray(xf) ? xf[0] : xf)?.split(",")[0]?.trim() ??
        req.socket.remoteAddress ??
        null;

    (req as any).audit = {
        ip,
        userAgent: req.headers["user-agent"] ?? null,
    };

    next();
}
