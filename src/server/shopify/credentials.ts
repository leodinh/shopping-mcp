import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export type ShopifyCredentials = {
  accessToken: string;
  refreshToken?: string;
};

function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required");
  return createHash("sha256").update(secret).digest();
}

export function encryptCredentials(credentials: ShopifyCredentials) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(credentials), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function decryptCredentials(payload: string): ShopifyCredentials {
  const buffer = Buffer.from(payload, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key(), buffer.subarray(0, 12));
  decipher.setAuthTag(buffer.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]).toString("utf8"),
  ) as ShopifyCredentials;
}
