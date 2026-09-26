import {
  SESSION_MAX_AGE,
  createSession,
  destroySession,
  readSessionToken,
  requireSession,
} from "@shopping-mcp/commerce/auth";
import { getMerchantStatus } from "@shopping-mcp/commerce/merchants";
import type { Database } from "@shopping-mcp/database";

export function sessionToken(cookieHeader: string | null) {
  return cookieHeader?.match(/(?:^|;\s*)session=([^;]+)/)?.[1] ?? null;
}

export function readSessionCookie(cookieHeader: string | null) {
  return readSessionToken(sessionToken(cookieHeader));
}

export function sessionCookie(token: string) {
  return `session=${token}; HttpOnly; Path=/; Max-Age=${SESSION_MAX_AGE}; SameSite=Lax`;
}

export function clearSessionCookie() {
  return "session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax";
}

export async function createSessionCookie(merchantId: string, db?: Database) {
  return sessionCookie(await createSession(merchantId, db));
}

export async function destroySessionCookie(cookieHeader: string | null) {
  await destroySession(sessionToken(cookieHeader));
  return clearSessionCookie();
}

export async function getDashboardMerchant(cookieHeader: string | null, db?: Database) {
  let merchantId: string;
  try {
    merchantId = await requireSession(sessionToken(cookieHeader), db);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return null;
    throw error;
  }
  return getMerchantStatus(merchantId, db);
}
