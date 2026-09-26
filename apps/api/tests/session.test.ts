import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { signSessionToken } from "@shopping-mcp/commerce/auth";
import { readSessionCookie, clearSessionCookie } from "../src/auth/session";
process.env.SESSION_SECRET = "test-session-secret-32-characters-min";

test("session cookie round-trips and rejects missing, tampered, or expired values", () => {
  const sessionId = randomUUID();
  const value = signSessionToken(sessionId);
  assert.equal(readSessionCookie(`session=${value}`), sessionId);
  assert.throws(() => readSessionCookie(null), /Unauthorized/);
  assert.throws(() => readSessionCookie("oauth_binding=abc"), /Unauthorized/);
  const tampered = value.slice(0, -1) + (value.endsWith("a") ? "b" : "a");
  assert.throws(() => readSessionCookie(`session=${tampered}`), /Unauthorized/);
  assert.throws(
    () => readSessionCookie(`session=${signSessionToken(sessionId, Date.now() - 1)}`),
    /Unauthorized/,
  );
});

test("clearSessionCookie expires the seller session cookie", () => {
  const cookie = clearSessionCookie();
  assert.match(cookie, /^session=;/);
  assert.match(cookie, /Max-Age=0/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
});
