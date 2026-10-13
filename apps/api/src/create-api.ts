import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import { webOrigin } from "@shopping-mcp/config";
import { AppModule } from "./app.module";
import { mountBetterAuth } from "./auth/mount";

export async function createApi() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    logger: false,
  });
  app.enableCors({
    origin: webOrigin(),
    credentials: true,
  });
  // API responses are per-user or live data: no shared cache (CDN, tunnel edge) may store them.
  // Registered first so it covers Better Auth's routes too; a handler can still set its own.
  app.use("/api", (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", "private, no-store");
    next();
  });
  mountBetterAuth(app);
  await app.init();
  return app;
}
