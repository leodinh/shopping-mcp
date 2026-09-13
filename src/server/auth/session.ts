import { createHmac, timingSafeEqual } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { database } from "@/server/db/client";
import type { Session } from "@/server/db/schema";

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

export async function createSession(merchantId: string, pool: Pool | PoolClient = database()) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const inserted = await pool.query<Pick<Session, "id">>(
    "INSERT INTO sessions (merchant_id, expires_at) VALUES ($1, $2) RETURNING id",
    [merchantId, expiresAt],
  );
  return `session=${signSessionCookie(inserted.rows[0].id, expiresAt.getTime())}`;
}

export async function requireSession(cookieHeader: string | null, pool: Pool = database()) {
  const sessionId = readSessionCookie(cookieHeader);
  const result = await pool.query<{ merchant_id: string }>(
    "SELECT merchant_id FROM sessions WHERE id = $1 AND expires_at > now()",
    [sessionId],
  );
  if (!result.rows[0]) throw new Error("Unauthorized");
  return result.rows[0].merchant_id;
}
