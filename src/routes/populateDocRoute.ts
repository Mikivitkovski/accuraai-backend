import { Router } from "express";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const router = Router();

const SCHEDULED: Map<string, NodeJS.Timeout> = new Map();

router.post("/populateDoc", async (req, res) => {
  try {
    const orgId: string | undefined =
      (req.body && req.body.orgId) ||
      (req as any)?.user?.organizationId ||
      undefined;

    const delayMinutesRaw = Number(req.body?.delayMinutes ?? 1);
    const delayMinutes = Number.isFinite(delayMinutesRaw) && delayMinutesRaw >= 0
      ? Math.min(24 * 60, Math.trunc(delayMinutesRaw))
      : 1;

    const timesRaw = Number(req.body?.concurrency ?? req.body?.times ?? 1);
    const MAX_CONCURRENCY = parseInt(process.env.POPDOC_MAX_CONCURRENCY ?? "10", 10);
    const times = Number.isFinite(timesRaw)
      ? Math.max(1, Math.min(MAX_CONCURRENCY, Math.trunc(timesRaw)))
      : 1;

    const STAGGER_MS = parseInt(process.env.POPDOC_STAGGER_MS ?? "250", 10);

    const env = {
      ...process.env,
      USE_S3: "1",
      RUN_MODE: "once",
      DATE_TZ: process.env.DATE_TZ || "Europe/Skopje",
      S3_ROOT_PREFIX: orgId || (process.env.S3_ROOT_PREFIX || ""),
    };

    const repoRoot = path.resolve(__dirname, "..", "..");
    const logsDir = path.join(repoRoot, "logs");
    const scriptPath = path.join(repoRoot, "scripts", "populateDoc.js");
    const outPath = path.join(logsDir, "populateDoc.out.log");
    const errPath = path.join(logsDir, "populateDoc.err.log");
    const metaPath = path.join(logsDir, "populateDoc.meta.log");

    fs.mkdirSync(logsDir, { recursive: true });

    const banner =
      `\n=== [${new Date().toISOString()}] POST /tasks/populateDoc ` +
      `(orgId=${orgId ?? "-"}) ===\n` +
      `repoRoot=${repoRoot}\nscriptPath=${scriptPath}\n` +
      `env.USE_S3=${env.USE_S3} env.RUN_MODE=${env.RUN_MODE} env.S3_ROOT_PREFIX=${env.S3_ROOT_PREFIX}\n` +
      `delayMinutes=${delayMinutes} spawn.times=${times}\n`;

    fs.appendFileSync(metaPath, banner);

    if (!fs.existsSync(scriptPath)) {
      const msg = `FATAL: script not found at ${scriptPath}`;
      fs.appendFileSync(metaPath, msg + "\n");
      return res.status(500).json({ error: msg, repoRoot, scriptPath, logsDir });
    }

    const outFd = fs.openSync(outPath, "a");
    const errFd = fs.openSync(errPath, "a");
    fs.writeSync(outFd, banner);
    fs.writeSync(errFd, banner);

    const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const fire = async () => {
      const startMsg =
        `[${new Date().toISOString()}] job=${jobId} starting populateDoc (times=${times})\n`;
      fs.appendFileSync(metaPath, startMsg);
      console.log("[populateDoc]", startMsg.trim());

      for (let i = 0; i < times; i++) {
        if (i > 0 && STAGGER_MS > 0) {
          await new Promise(r => setTimeout(r, STAGGER_MS));
        }

        const child = spawn(process.execPath, [scriptPath], {
          env: { ...env, SPAWN_IDX: String(i) },
          cwd: repoRoot,
          detached: true,
          stdio: ["ignore", outFd, errFd],
          windowsHide: true,
        });

        const m = `[${new Date().toISOString()}] spawned pid=${child.pid} idx=${i} (job=${jobId})\n`;
        fs.appendFileSync(metaPath, m);
        console.log("[populateDoc]", m.trim());

        child.on("error", (e) => {
          const em = `[${new Date().toISOString()}] SPAWN ERROR idx=${i} job=${jobId}: ${e?.message || e}\n`;
          fs.appendFileSync(metaPath, em);
          fs.appendFileSync(errPath, em);
          console.error("[populateDoc]", e);
        });

        child.on("exit", (code, signal) => {
          const xm = `[${new Date().toISOString()}] EXIT (idx=${i}) code=${code} signal=${signal ?? "-"} (job=${jobId})\n`;
          fs.appendFileSync(metaPath, xm);
          console.log("[populateDoc]", xm.trim());
        });

        child.unref();
      }

      SCHEDULED.delete(jobId);
    };

    const delayMs = delayMinutes * 60_000;
    const runAt = new Date(Date.now() + delayMs).toISOString();

    const timer = setTimeout(() => { void fire(); }, delayMs);
    SCHEDULED.set(jobId, timer);

    fs.appendFileSync(
      metaPath,
      `[${new Date().toISOString()}] job=${jobId} scheduled to run at ${runAt}\n`
    );

    return res.status(202).json({
      started: true,
      jobId,
      scheduledFor: runAt,
      delayMinutes,
      repoRoot,
      logsDir,
      scriptPath,
      times,
      maxConcurrency: MAX_CONCURRENCY,
      staggerMs: STAGGER_MS,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to schedule populateDoc" });
  }
});

export default router;
