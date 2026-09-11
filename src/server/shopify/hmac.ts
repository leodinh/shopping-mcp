import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyShopifyHmac(searchParams: URLSearchParams) {
  const hmac = searchParams.get("hmac");
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!hmac || !secret) throw new Error("Invalid HMAC");
  const message = [...searchParams.entries()]
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const digest = createHmac("sha256", secret).update(message).digest("hex");
  const expected = Buffer.from(digest);
  const actual = Buffer.from(hmac);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error("Invalid HMAC");
  }
}
