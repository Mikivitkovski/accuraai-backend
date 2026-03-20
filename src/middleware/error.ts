import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  console.error("[ERROR]", err?.message ?? err);
  if (err?.stack) console.error(err.stack);

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "ValidationError",
      issues: err.flatten(),
    });
  }

  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  const status: number =
    Number.isInteger(err?.statusCode) ? err.statusCode :
    Number.isInteger(err?.status) ? err.status :
    500;

  const message =
    typeof err?.message === "string" && err.message.length > 0
      ? err.message
      : "Internal Server Error";

  const body: Record<string, unknown> = { error: message };

  if (process.env.NODE_ENV !== "production" && err?.details) {
    body.details = err.details;
  }

  return res.status(status).json(body);
}
