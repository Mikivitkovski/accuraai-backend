import "reflect-metadata";
import { DataSource } from "typeorm";
import { env } from "../config/env";

import { User } from "../entities/User";
import { Organization } from "../entities/Organization";
import { FileEntity } from "../entities/File";
import { AuditLog } from "../entities/AuditLog";

import { Plan } from "../entities/Plan";
import { Subscription } from "../entities/Subscription";
import { PaymentMethod } from "../entities/PaymentMethod";
import { Payment } from "../entities/Payment";
import { Notification } from "../entities/Notification";
import { Company } from "../entities/Company";
import { DocumentExtraction } from "../entities/DocumentExtraction";
import { DocumentField } from "../entities/DocumentField";

function addNoVerify(url: string) {
  if (!url) return url;
  const cleaned = url.replace(/([?&])sslmode=[^&]*/i, "$1").replace(/[?&]$/, "");
  return cleaned.includes("?")
    ? `${cleaned}&sslmode=no-verify`
    : `${cleaned}?sslmode=no-verify`;
}

const isProd = process.env.NODE_ENV === "production";
const noVerify = { rejectUnauthorized: false };

const ENTITIES = [
  User,
  Organization,
  FileEntity,
  AuditLog,
  Plan,
  Subscription,
  PaymentMethod,
  Payment,
  Notification,
  Company,
  DocumentExtraction,
  DocumentField,
];

export const AppDataSource = new DataSource({
  type: "postgres",
  url: isProd ? addNoVerify(env.DATABASE_URL) : env.DATABASE_URL,
  ssl: isProd ? noVerify : false,
  extra: isProd ? { ssl: noVerify } : undefined,
  logging: env.DB_LOGGING,
  synchronize: env.DB_SYNCHRONIZE,
  entities: ENTITIES,
});

export const MigrationsDataSource = new DataSource({
  type: "postgres",
  url: isProd
    ? addNoVerify(env.DATABASE_URL_MIGRATIONS || env.DATABASE_URL)
    : env.DATABASE_URL_MIGRATIONS || env.DATABASE_URL,
  ssl: isProd ? noVerify : false,
  extra: isProd ? { ssl: noVerify } : undefined,
  logging: env.DB_LOGGING,
  entities: ENTITIES,
  migrations: ["src/db/migrations/*.ts"],
});
