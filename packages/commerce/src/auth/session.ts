import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { sessionSecret } from "@shopping-mcp/config";
import { database, sessions, type Database } from "@shopping-mcp/database";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_MAX_AGE = SESSION_TTL_MS / 1000;

function secret() {
  return sessionSecret();
}

export function signSessionToken(sessionId: string, expiresAt = Date.now() + SESSION_TTL_MS) {
  const payload = `${sessionId}.${expiresAt}`;
  return `${payload}.${createHmac("sha256", secret()).update(payload).digest("hex")}`;
}

export function readSessionToken(value: string | null) {
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
  return signSessionToken(inserted.id, expiresAt.getTime());
}

export async function destroySession(token: string | null, db: Database = database()) {
  try {
    const sessionId = readSessionToken(token);
    await db.delete(sessions).where(eq(sessions.id, sessionId));
  } catch {
    // An invalid token has no active session to delete.
  }
}

export async function requireSession(token: string | null, db?: Database) {
  const sessionId = readSessionToken(token);
  const [row] = await (db ?? database())
    .select({ merchantId: sessions.merchantId })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())));
  if (!row) throw new Error("Unauthorized");
  return row.merchantId;
}
