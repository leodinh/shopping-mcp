import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { credentialsKey, sessionSecret } from "@shopping-mcp/config";

export type ShopifyCredentials = {
  accessToken: string;
  refreshToken?: string;
};

function keyFrom(secret: string) {
  return createHash("sha256").update(secret).digest();
}

export function encryptCredentials(credentials: ShopifyCredentials) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(credentialsKey()), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(credentials), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

function decryptWith(key: Buffer, payload: string): ShopifyCredentials {
  const buffer = Buffer.from(payload, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, buffer.subarray(0, 12));
  decipher.setAuthTag(buffer.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]).toString("utf8"),
  ) as ShopifyCredentials;
}

/**
 * `legacy` is true when the payload was encrypted with the old SESSION_SECRET-derived key;
 * callers re-encrypt it so the fallback can eventually be deleted.
 */
export function openCredentials(payload: string) {
  const key = keyFrom(credentialsKey()); // outside the try: a missing key must fail, not fall back
  try {
    return { credentials: decryptWith(key, payload), legacy: false };
  } catch {
    // ponytail: legacy fallback, delete once no row is still encrypted with SESSION_SECRET.
    return { credentials: decryptWith(keyFrom(sessionSecret()), payload), legacy: true };
  }
}

export function decryptCredentials(payload: string) {
  return openCredentials(payload).credentials;
}
