import { Pool } from "pg";

const cs = process.env.DATABASE_URL!;
const sslWanted =
  /\bsslmode=require\b/i.test(cs) ||
  (process.env.DATABASE_SSL || "").toLowerCase() === "true";

export const pool = new Pool({
  connectionString: cs,
  ssl: sslWanted ? { rejectUnauthorized: false } : false,
});
