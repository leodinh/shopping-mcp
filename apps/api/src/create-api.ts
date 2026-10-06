import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
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
  mountBetterAuth(app);
  await app.init();
  return app;
}
