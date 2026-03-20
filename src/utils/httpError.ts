export type ControllerErr = { message?: string; name?: string; code?: string | number };

export function errorMsg(e: unknown, fallback = "Internal Server Error"): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (isWithMessage(e)) return e.message;
  return fallback;
}

function isWithMessage(x: unknown): x is { message: string } {
  return typeof x === "object" && x !== null && "message" in x
    && typeof (x as { message?: unknown }).message === "string";
}
