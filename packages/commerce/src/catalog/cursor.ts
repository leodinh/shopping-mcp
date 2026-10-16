import { createHash, createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { SearchQuery } from "@shopping-mcp/contracts";

const VERSION = 1;
export const CURSOR_TTL_MS = 30 * 60 * 1000;

/** One store's place in a search session. `after` is the provider's own position; opaque here. */
export type StorePosition = { merchantId: string; after: string | null; done: boolean };

export type SearchCursor = {
  /** Stores in their stable round-robin order. */
  stores: StorePosition[];
  /** Index into `stores` of whose turn it is next. */
  next: number;
};

const payloadSchema = z.object({
  v: z.literal(VERSION),
  exp: z.number().int(),
  fp: z.string(),
  stores: z
    .array(z.object({ m: z.uuid(), a: z.string().max(2000).nullable(), d: z.boolean() }))
    .max(500),
  n: z.number().int().min(0),
});

/** A cursor that is forged, expired, from an older version, or from a different search. */
export class InvalidCursor extends Error {}

/** The signing key: derived from the auth secret for this one purpose, never the secret itself. */
export function cursorKey(secret: string) {
  return Buffer.from(hkdfSync("sha256", secret, "", "search-cursor", 32));
}

/** What a cursor is bound to: the search's query and filters, not the page size. */
export function searchFingerprint(query: SearchQuery) {
  const { q, merchantId, country, currency, maxPrice, inStock } = query;
  return createHash("sha256")
    .update(
      JSON.stringify([
        q,
        merchantId ?? null,
        country ?? null,
        currency ?? null,
        maxPrice ?? null,
        inStock,
      ]),
    )
    .digest("base64url")
    .slice(0, 22);
}

const sign = (key: Buffer, body: string) => createHmac("sha256", key).update(body).digest();

/** Stateless and opaque: base64url(JSON).base64url(HMAC). Nothing is stored server-side. */
export function encodeCursor(
  cursor: SearchCursor,
  query: SearchQuery,
  key: Buffer,
  now = Date.now(),
) {
  const body = Buffer.from(
    JSON.stringify({
      v: VERSION,
      exp: now + CURSOR_TTL_MS,
      fp: searchFingerprint(query),
      stores: cursor.stores.map((store) => ({
        m: store.merchantId,
        a: store.after,
        d: store.done,
      })),
      n: cursor.next,
    }),
  ).toString("base64url");
  return `${body}.${sign(key, body).toString("base64url")}`;
}

export function decodeCursor(
  token: string,
  query: SearchQuery,
  key: Buffer,
  now = Date.now(),
): SearchCursor {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) throw new InvalidCursor("Malformed cursor");
  const expected = sign(key, body);
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new InvalidCursor("Cursor signature does not match");
  }
  let payload;
  try {
    payload = payloadSchema.parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
  } catch {
    throw new InvalidCursor("Unsupported cursor");
  }
  if (payload.exp < now) throw new InvalidCursor("Cursor expired; start the search again");
  if (payload.fp !== searchFingerprint(query)) {
    throw new InvalidCursor("Cursor belongs to a different search; send the same parameters");
  }
  return {
    stores: payload.stores.map((store) => ({ merchantId: store.m, after: store.a, done: store.d })),
    next: payload.n,
  };
}
