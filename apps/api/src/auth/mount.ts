import type { NestExpressApplication } from "@nestjs/platform-express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./better-auth";

/**
 * Hands `/api/auth/*` and the root `/.well-known/*` discovery documents to Better Auth. Must run
 * before `app.init()`: Nest registers its JSON body parser there, and Better Auth reads the raw body.
 */
export function mountBetterAuth(app: NestExpressApplication) {
  let node: ReturnType<typeof toNodeHandler> | undefined;
  // Built on first use so booting the API (and its tests) never needs auth secrets.
  const handler: ReturnType<typeof toNodeHandler> = (req, res) =>
    (node ??= toNodeHandler(auth()))(req, res);
  const express = app.getHttpAdapter().getInstance();
  express.all("/api/auth/*splat", handler);
  express.get("/.well-known/*splat", handler);
}
