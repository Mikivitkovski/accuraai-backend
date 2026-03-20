import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
extendZodWithOpenApi(z);

export const OrganizationIdParam = z.object({
  id: z.string().uuid(),
});

export const WebsiteSchema = z
  .string()
  .trim()
  .max(255)
  .optional()
  .nullable()
  .transform((v) => {
    const s = (v ?? "").trim();
    return s.length ? s : null;
  })
  .refine((v) => {
    if (v == null) return true;
    if (/\s/.test(v)) return false;

    const domainish = /^([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/i.test(v);
    const urlish = /^https?:\/\/.+/i.test(v);

    return domainish || urlish;
  }, "Invalid website");

export const OrganizationListQuerySchema = z.object({
  relations: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const OrganizationFileParam = z.object({
  id: z.string().uuid(),
  fileId: z.string().uuid(),
});

export const OrganizationCreateSchema = z.object({
  name: z.string().min(1).max(120),
  country: z.string().min(2).max(80),

  contactName: z.string().min(1).max(120),
  contactEmail: z.string().email(),
  contactPhone: z.string().min(6).max(40),

  description: z.string().optional().nullable(),
  website: WebsiteSchema,
  taxId: z.string().trim().min(1).max(80).optional().nullable(),
  registrationDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "registrationDate must be YYYY-MM-DD")
    .optional()
    .nullable(),
  contactPosition: z.string().min(1).max(120).optional().nullable(),
});

export const OrganizationUpdateSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    legalName: z.string().trim().min(1).nullable().optional(),
    description: z.string().optional().nullable(),
    country: z.string().min(2).max(80).optional(),
    website: WebsiteSchema,

    taxId: z.string().trim().min(1).max(80).nullable().optional(),
    registrationDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),

    contactName: z.string().min(1).max(120).optional(),
    contactPosition: z.string().min(1).max(120).optional().nullable(),
    contactEmail: z.string().email().optional().nullable(),
    contactPhone: z.string().min(6).max(40).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Body must contain at least one field",
  });