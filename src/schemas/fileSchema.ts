import { z } from "zod";
import { registry } from "./authSchema";

const sizeBytesCoerce = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return undefined;
    return typeof v === "number" ? String(v) : v;
  });

export const FileIdParam = z.object({ id: z.string().uuid() }).openapi("FileIdParam");

export const FileCreateSchema = z
  .object({
    filename: z.string().min(1).max(255),
    path: z.string().min(1),
    mimeType: z.string().max(255).optional().nullable(),
    contentType: z.string().max(255).optional(),
    sizeBytes: sizeBytesCoerce,
    organizationId: z.string().uuid(),
  })
  .transform((v) => {
    const { contentType, ...rest } = v as any;
    if (!rest.mimeType && contentType) rest.mimeType = contentType;
    return rest;
  })
  .openapi("FileCreate");

export const FileUpdateSchema = z
  .object({
    filename: z.string().min(1).max(255).optional(),
    path: z.string().min(1).optional(),
    mimeType: z.string().max(255).optional().nullable(),
    contentType: z.string().max(255).optional(),
    sizeBytes: sizeBytesCoerce,
    organizationId: z.string().uuid().optional(),
  })
  .transform((v) => {
    const { contentType, ...rest } = v as any;
    if (!rest.mimeType && contentType) rest.mimeType = contentType;
    return rest;
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Body must contain at least one field",
  })
  .openapi("FileUpdate");

export const FileSchema = z
  .object({
    id: z.string().uuid(),
    filename: z.string(),
    path: z.string(),
    mimeType: z.string().nullable().optional(),
    sizeBytes: z.string().optional(),
    organizationId: z.string().uuid().nullable().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("File");

export const FilesListSchema = z.array(FileSchema).openapi("FilesList");

registry.registerPath({
  method: "post",
  path: "/api/files",
  summary: "Create file metadata",
  request: {
    body: { content: { "application/json": { schema: FileCreateSchema } } },
  },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: FileSchema } } },
    400: { description: "Bad Request" },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/files",
  summary: "List files",
  responses: {
    200: { description: "OK", content: { "application/json": { schema: FilesListSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/files/{id}",
  summary: "Get file",
  request: { params: FileIdParam },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: FileSchema } } },
    404: { description: "Not found" },
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/files/{id}",
  summary: "Update file metadata",
  request: {
    params: FileIdParam,
    body: { content: { "application/json": { schema: FileUpdateSchema } } },
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: FileSchema } } },
    400: { description: "Bad Request" },
    404: { description: "Not found" },
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/files/{id}",
  summary: "Delete file metadata",
  request: { params: FileIdParam },
  responses: {
    204: { description: "No Content" },
    404: { description: "Not found" },
  },
});