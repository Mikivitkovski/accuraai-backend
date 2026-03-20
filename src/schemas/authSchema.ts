import { z } from "zod";
import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

export const RoleEnum = z.enum(["admin", "owner", "member", "reviewer"]);

export const UserIdParam = z
  .object({ id: z.string().uuid() })
  .openapi("UserIdParam");

const UserBaseSchema = z.object({
  email: z.string().email().max(120),
  name: z.string().min(1).max(80),
});

export const UserCreateSchema = UserBaseSchema.extend({
  password: z.string().min(8).max(72),
  isReviewer: z.boolean().optional().default(false),
}).openapi("UserCreate");

export const UserUpdateSchema = z
  .object({
    email: z.string().email().max(120).optional(),
    name: z.string().min(1).max(80).optional(),
    organizationId: z.string().uuid().nullable().optional(),
    isReviewer: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Body must contain at least one field",
  })
  .openapi("UserUpdate");

export const UserSchema = UserBaseSchema.extend({
  id: z.string().uuid(),
  organizationId: z.string().uuid().nullable().optional(),
  role: RoleEnum.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).openapi("User");

export const UsersListSchema = z.array(UserSchema).openapi("UsersList");

export const RegisterSchema = z
  .object({
    email: z.string().email().max(120),
    name: z.string().min(1).max(80),
    password: z.string().min(8).max(72),
    organizationId: z.string().uuid().optional().nullable(),
  })
  .openapi("Register");

export const LoginSchema = z
  .object({
    email: z.string().email().max(120),
    password: z.string().min(8).max(72),
  })
  .openapi("Login");

export const MeSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string(),
    organizationId: z.string().uuid().nullable().optional(),
    role: RoleEnum.optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Me");

registry.registerPath({
  method: "post",
  path: "/api/users/member",
  summary: "Create user",
  request: {
    body: { content: { "application/json": { schema: UserCreateSchema } } },
  },
  responses: {
    201: {
      description: "Created",
      content: { "application/json": { schema: UserSchema } },
    },
    409: { description: "Email already exists" },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/users",
  summary: "List users",
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: UsersListSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/users/{id}",
  summary: "Get user",
  request: { params: UserIdParam },
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: UserSchema } },
    },
    404: { description: "Not found" },
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/users/{id}",
  summary: "Update user",
  request: {
    params: UserIdParam,
    body: { content: { "application/json": { schema: UserUpdateSchema } } },
  },
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: UserSchema } },
    },
    400: { description: "Bad Request" },
    404: { description: "Not found" },
    409: { description: "Email already exists" },
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/users/{id}",
  summary: "Delete user",
  request: { params: UserIdParam },
  responses: {
    204: { description: "No Content" },
    404: { description: "Not found" },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/auth/register",
  summary: "Register a new user",
  request: {
    body: { content: { "application/json": { schema: RegisterSchema } } },
  },
  responses: {
    201: {
      description: "User Created",
      content: { "application/json": { schema: MeSchema } },
    },
    409: { description: "Email already exists" },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/auth/login",
  summary: "User login",
  request: {
    body: { content: { "application/json": { schema: LoginSchema } } },
  },
  responses: {
    200: {
      description: "Login successful",
      content: { "application/json": { schema: MeSchema } },
    },
    400: { description: "Invalid credentials" },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/auth/me",
  summary: "Get current logged-in user",
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: MeSchema } },
    },
    401: { description: "Unauthorized" },
  },
});

export function buildOpenApi() {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: "3.0.3",
    info: { title: "Accuraai API", version: "1.0.0" },
    servers: [{ url: "http://localhost:3000" }],
  });
}