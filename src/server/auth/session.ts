import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { database, type Database } from "@/server/db/client";
import { sessions } from "@/server/db/schema";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE_MAX_AGE = SESSION_TTL_MS / 1000;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET is required");
  return value;
}

export function signSessionCookie(sessionId: string, expiresAt = Date.now() + SESSION_TTL_MS) {
  const payload = `${sessionId}.${expiresAt}`;
  return `${payload}.${createHmac("sha256", secret()).update(payload).digest("hex")}`;
}

export function readSessionCookie(cookieHeader: string | null) {
  const value = cookieHeader?.match(/(?:^|;\s*)session=([^;]+)/)?.[1];
  const [sessionId, exp, sig] = value?.split(".") ?? [];
  const expected =
    sessionId && exp
      ? createHmac("sha256", secret()).update(`${sessionId}.${exp}`).digest("hex")
      : "";
  if (
    !sig ||
    sig.length !== expected.length ||
    !timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ||
    Number(exp) < Date.now()
  ) {
    throw new Error("Unauthorized");
  }
  return sessionId;
}

export async function createSession(merchantId: string, db: Database = database()) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const [inserted] = await db
    .insert(sessions)
    .values({ merchantId, expiresAt })
    .returning({ id: sessions.id });
  return `session=${signSessionCookie(inserted.id, expiresAt.getTime())}`;
}

export function clearSessionCookie() {
  return "session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax";
}

export async function destroySession(cookieHeader: string | null, db: Database = database()) {
  try {
    const sessionId = readSessionCookie(cookieHeader);
    await db.delete(sessions).where(eq(sessions.id, sessionId));
  } catch {
    // Already unauthorized — still expire the cookie.
  }
  return clearSessionCookie();
}

export async function requireSession(cookieHeader: string | null, db: Database = database()) {
  const sessionId = readSessionCookie(cookieHeader);
  const [row] = await db
    .select({ merchantId: sessions.merchantId })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())));
  if (!row) throw new Error("Unauthorized");
  return row.merchantId;
}
