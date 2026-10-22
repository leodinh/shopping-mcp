import type { ProviderPage } from "../provider";

/** A store's search page as cached, with when the provider answered (epoch ms). */
export type CachedPage = { page: ProviderPage; fetchedAt: number };

/** Any failure or timeout talking to the cache. Callers fall back to live provider calls. */
export class CacheUnavailable extends Error {}

/**
 * Shared cache for store search pages, with a lock per page so only one pod fetches it. Every
 * method throws `CacheUnavailable` instead of hanging when the cache is down or slow.
 */
export interface PageCache {
  /** The cached entry (any age) and whether another worker holds the page's lock. */
  read(key: string): Promise<{ entry: CachedPage | null; locked: boolean }>;
  /** Takes the page's lock for `ttlMs` if nobody holds it. */
  acquire(key: string, token: string, ttlMs: number): Promise<boolean>;
  /**
   * Stores `entry` for `ttlMs` only while `token` still holds the lock and nothing newer is
   * stored, then releases the lock. False when the write was refused (lock lost, newer data).
   */
  commit(key: string, token: string, entry: CachedPage, ttlMs: number): Promise<boolean>;
  /** Releases the lock only if `token` still holds it. */
  release(key: string, token: string): Promise<void>;
}

/**
 * Both keys share a hash tag (`{…}`), so the Lua scripts touching data and lock together also
 * work on Redis Cluster.
 */
export const dataKey = (key: string) => `search:v1:{${key}}`;
export const lockKey = (key: string) => `search:v1:{${key}}:lock`;

export function parseEntry(raw: string | null): CachedPage | null {
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as CachedPage;
    return typeof entry?.fetchedAt === "number" && Array.isArray(entry.page?.items) ? entry : null;
  } catch {
    return null;
  }
}
