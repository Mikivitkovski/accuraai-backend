import dotenv from "dotenv";
dotenv.config({ path: process.env.NODE_ENV === "production" ? ".env" : ".env.local" });

import "reflect-metadata";
import app from "./app";
import { env } from "./config/env";
import { AppDataSource } from "./db/dataSource";
import { ensurePlans } from "./db/ensurePlans";

const port = env.PORT;

async function bootstrap() {
  try {
    await AppDataSource.initialize();
    console.log(" Database connected");

    await ensurePlans();
    console.log(" Plans ensured");

    app.listen(port, () => {
      console.log(` Server http://localhost:${port}`);
      console.log(` Swagger http://localhost:${port}/api/docs`);
    });
  } catch (err) {
    console.error(" DB init error:", err);
    process.exit(1);
  }
}

bootstrap();