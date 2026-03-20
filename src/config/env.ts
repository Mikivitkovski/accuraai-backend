import dotenv from "dotenv";
dotenv.config();

const must = (key: string) => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env: ${key}`);
  return v;
};

const bool = (v: string | undefined, def = false) =>
  ["1", "true", "yes", "on"].includes(String(v ?? "").toLowerCase()) ||
  (v == null ? def : false);

const num = (v: string | undefined, def: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: num(process.env.PORT, 3001),

  DB_HOST: process.env.DB_HOST ?? "localhost",
  DB_PORT: num(process.env.DB_PORT, 5432),
  DB_USER: process.env.DB_USER ?? "postgres",
  DB_PASSWORD: process.env.DB_PASSWORD ?? "postgres",
  DB_NAME: process.env.DB_NAME ?? "Accuraai",

  DATABASE_URL: must("DATABASE_URL"),
  DATABASE_URL_MIGRATIONS: process.env.DATABASE_URL_MIGRATIONS,

  DATABASE_SSL: process.env.DATABASE_SSL,

  DB_LOGGING: bool(process.env.DB_LOGGING, true),
  DB_SYNCHRONIZE: bool(process.env.DB_SYNCHRONIZE, false),

  AWS_REGION: process.env.AWS_REGION,
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  S3_BUCKET: process.env.S3_BUCKET,
  S3_BASE_PREFIX: process.env.S3_BASE_PREFIX ?? "",
  S3_AI_BUCKET: process.env.S3_AI_BUCKET!,
  S3_AI_PREFIX: process.env.S3_AI_PREFIX ?? "uploads/",
  S3_AI_FORMS_PREFIX: process.env.S3_AI_FORMS_PREFIX ?? "forms/",

  SUPPORT_INBOX: process.env.SUPPORT_INBOX,
  JWT_SECRET: must("JWT_SECRET"),
  FRONTEND_URL: process.env.FRONTEND_URL || "",
  SUPABASE_URL: must("SUPABASE_URL"),
  SUPABASE_ANON_KEY: must("SUPABASE_ANON_KEY"),
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,

  SMTP_HOST: must("SMTP_HOST"),
  SMTP_PORT: num(process.env.SMTP_PORT, 587),
  SMTP_SECURE: bool(process.env.SMTP_SECURE, false), 
  SMTP_USER: must("SMTP_USER"),
  SMTP_PASS: must("SMTP_PASS"),

  APP_URL: must("APP_URL"),
  MAIL_FROM: must("MAIL_FROM"),
} as const;
