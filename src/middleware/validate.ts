import { Request, Response, NextFunction } from "express";
import type { ZodTypeAny } from "zod";

type Where = "body" | "query" | "params";

function replaceObject(target: unknown, src: unknown) {
  if (
    target &&
    typeof target === "object" &&
    src &&
    typeof src === "object"
  ) {
    const t = target as Record<string, unknown>;
    const s = src as Record<string, unknown>;
    for (const k of Object.keys(t)) delete t[k];
    Object.assign(t, s);
  }
}

export function validate(schema: ZodTypeAny): (
  req: Request,
  res: Response,
  next: NextFunction
) => void;
export function validate(schema: ZodTypeAny, where: Where): (
  req: Request,
  res: Response,
  next: NextFunction
) => void;

export function validate(schema: ZodTypeAny, where: Where = "body") {
  return (req: Request, res: Response, next: NextFunction) => {
    const current =
      where === "body" ? req.body : where === "query" ? req.query : req.params;

    const parsed = schema.safeParse(current);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation failed",
        where,
        details: parsed.error.flatten(),
      });
    }

    if (where === "body") {
      req.body = parsed.data;
    } else if (where === "query") {
      replaceObject(req.query, parsed.data);
    } else {
      replaceObject(req.params, parsed.data);
    }

    next();
  };
}
