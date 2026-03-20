import { AppDataSource } from "./dataSource";

let initPromise: Promise<void> | null = null;

export async function ensureDataSource(): Promise<void> {
  if (AppDataSource.isInitialized) return;

  if (!initPromise) {
    initPromise = AppDataSource.initialize()
      .then(() => {
        const opts = AppDataSource.options as any;
        console.log(
          "[DB] DataSource initialized",
          "| ssl:",
          !!opts?.ssl,
          "| extra.ssl.rejectUnauthorized:",
          opts?.extra?.ssl?.rejectUnauthorized ?? "-"
        );
      })
      .catch((err) => {
        initPromise = null;
        console.error("[DB] init failed:", err?.message || err);
        throw err;
      });
  }
  await initPromise;
}
