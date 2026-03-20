import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
extendZodWithOpenApi(z);

export const CompanyCreateSchema = z.object({
  name: z.string().min(2).max(200),
});