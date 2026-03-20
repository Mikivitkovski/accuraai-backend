import "reflect-metadata";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/auth";
import orgRoutes from "./routes/organizationRoutes";
import usersRoutes from "./routes/usersRoutes";
import buildMasterRouter from "./routes/buildMasterRoute";
import populateDocRouter from "./routes/populateDocRoute";
import contactRouter from "./routes/contactRoutes";
import { swaggerMiddleware } from "./swagger";
import { errorHandler } from "./middleware/error";
import { authenticate } from "./middleware/auth";
import { auditContext } from "./middleware/auditContext";
import { ensureDataSource } from "./db/ensureDataSource";
import auditRoutes from "./routes/auditRoutes";
import billingRoutes from "./routes/billingRoutes";
import planRoutes from "./routes/planRoutes";
import notificationRoutes from "./routes/notificationRoutes";
import meRoutes from "./routes/meRoutes";
import companyRoutes from "./routes/companyRoutes";
import exportRoutes from "./routes/exportRoutes";
import fileRoutes from "./routes/fileRoutes";

const app = express();

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
  })
);

const envAllow = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const fixedAllow = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://accuraai-frontend-three.vercel.app",
  "https://accuraai-backend.vercel.app",
  "https://accuraai.cc",
  "https://preview.accuraai.cc",
  "https://dev.accuraai.cc"
];
const allowList = [...new Set([...envAllow, ...fixedAllow])];

function isAllowedOrigin(origin?: string): boolean {
  if (!origin) return true;
  try {
    if (allowList.includes(origin)) return true;
    const { host } = new URL(origin);
    if (host.endsWith(".vercel.app")) return true;
    if (host === "localhost:3000" || host === "127.0.0.1:3000") return true;
  } catch {
    console.warn(`CORS: invalid origin '${origin}'`);
  }
  console.warn(`CORS: blocked origin '${origin}'`);
  return false;
}

const corsOptions: cors.CorsOptions = {
  origin: (origin, cb) => (isAllowedOrigin(origin) ? cb(null, true) : cb(new Error("CORS blocked"))),
  credentials: true,
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "X-API-Key"],
  exposedHeaders: ["Location"],
};

app.use((req, _res, next) => {
  console.log(`[REQ] ${req.method} ${req.path} | Origin: ${req.headers.origin ?? "-"}`);
  next();
});

app.use(cors(corsOptions));
app.options(/^\/api\/.*$/, cors(corsOptions));

app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));

app.get("/api/health", (_req, res) => res.json({ status: "OK" }));

app.get("/api/auth/__ping", (_req, res) => res.type("text/plain").send("ok"));

swaggerMiddleware(app, "/api");
app.use(express.static("public"));
app.get("/", (_req, res) => res.redirect("/api/docs"));

const PUBLIC_PATHS = new Set<string>([
  "/",
  "/favicon.ico",
  "/favicon.png",
  "/api/health",
  "/api/docs",
  "/api/docs-json",
  "/docs",
  "/docs-json",
  "/api/auth/__ping",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/logout",
  "/api/auth/login/mfa-complete",
  "/api/tasks/build-master",
  "/api/tasks/populateDoc",
  "/api/auth/verify-email-code",
  "/api/auth/resend-verification-public",
  "/api/contact",
]);

app.use(async (req, _res, next) => {
  if (req.method === "OPTIONS") return next();
  try {
    await ensureDataSource();
    return next();
  } catch (err) {
    return next(err);
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/organizations", orgRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api", fileRoutes);
app.use("/api", contactRouter);
app.use("/api/billing", billingRoutes);
app.use("/api/plans", planRoutes);
app.use("/api", exportRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/me", meRoutes);
app.use(errorHandler);
app.use(auditContext);
app.use("/api", auditRoutes);
app.use((_req, res) => res.status(404).json({ error: "Not Found" }));

export default app;