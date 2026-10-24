import { createClient, type RedisClientType } from "redis";
import {
  CacheUnavailable,
  dataKey,
  lockKey,
  parseEntry,
  type CachedPage,
  type PageCache,
} from "./page-cache";

// Write only while we still hold the lock and nothing newer is stored, then release. A holder
// whose lock expired (it ran past its TTL) can therefore never overwrite fresher data.
const COMMIT = `
if redis.call('GET', KEYS[2]) ~= ARGV[1] then return 0 end
local current = redis.call('GET', KEYS[1])
if current then
  local ok, decoded = pcall(cjson.decode, current)
  if ok and type(decoded) == 'table' and tonumber(decoded.fetchedAt)
    and tonumber(decoded.fetchedAt) >= tonumber(ARGV[3]) then
    redis.call('DEL', KEYS[2])
    return 0
  end
end
redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[4])
redis.call('DEL', KEYS[2])
return 1
`;

// Release only our own lock: another worker may hold it after ours expired.
const RELEASE = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0
`;

export type RedisPageCacheOptions = {
  /** Longest a single Redis command may take before it counts as a failure. */
  commandTimeoutMs?: number;
};

/**
 * `PageCache` on Redis. Commands are never queued while disconnected and each is bounded by a
 * timeout, so a down or slow Redis turns into `CacheUnavailable`, never a hung search.
 */
export class RedisPageCache implements PageCache {
  private readonly commandTimeoutMs: number;
  private lastErrorLog = 0;
  /** The first connection attempt; closing must wait for it (see `close`). */
  private connecting: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly client: RedisClientType,
    options: RedisPageCacheOptions = {},
  ) {
    this.commandTimeoutMs = options.commandTimeoutMs ?? 150;
  }

  /** Connects in the background; until connected (or while reconnecting) every call fails fast. */
  static connect(url: string, options: RedisPageCacheOptions = {}) {
    const client: RedisClientType = createClient({
      url,
      disableOfflineQueue: true,
      socket: {
        connectTimeout: 1000,
        reconnectStrategy: (retries) => Math.min(2 ** retries * 50, 5000),
      },
    });
    const cache = new RedisPageCache(client, options);
    // Without a listener, a connection error would crash the process.
    client.on("error", (error: unknown) => cache.logError(error));
    cache.connecting = client.connect().catch((error: unknown) => cache.logError(error));
    return cache;
  }

  async read(key: string) {
    const [raw, lock] = await this.run((client) => client.mGet([dataKey(key), lockKey(key)]));
    return { entry: parseEntry(raw), locked: lock !== null };
  }

  async acquire(key: string, token: string, ttlMs: number) {
    const reply = await this.run((client) =>
      client.set(lockKey(key), token, {
        condition: "NX",
        expiration: { type: "PX", value: ttlMs },
      }),
    );
    return reply === "OK";
  }

  async commit(key: string, token: string, entry: CachedPage, ttlMs: number) {
    const reply = await this.run((client) =>
      client.eval(COMMIT, {
        keys: [dataKey(key), lockKey(key)],
        arguments: [
          token,
          JSON.stringify(entry),
          String(entry.fetchedAt),
          String(Math.max(1, ttlMs)),
        ],
      }),
    );
    return reply === 1;
  }

  async release(key: string, token: string) {
    await this.run((client) => client.eval(RELEASE, { keys: [lockKey(key)], arguments: [token] }));
  }

  /** Connected and accepting commands. */
  get ready() {
    return this.client.isReady;
  }

  /**
   * Closes the connection. A connection still being set up can't be cancelled (destroying it then
   * lets it finish anyway, and that socket keeps the process alive), so first wait for the attempt
   * to settle, briefly; then close gracefully if connected, or stop reconnecting.
   */
  async close() {
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      this.connecting,
      new Promise((resolve) => (timer = setTimeout(resolve, 2000))),
    ]);
    clearTimeout(timer);
    if (this.client.isReady) {
      await this.client.close().catch(() => this.client.destroy());
      return;
    }
    try {
      this.client.destroy();
    } catch {
      // Never connected and not trying: nothing to stop.
    }
  }

  private async run<T>(command: (client: RedisClientType) => Promise<T>): Promise<T> {
    if (!this.client.isReady) throw new CacheUnavailable("Redis is not connected");
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        command(this.client),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new CacheUnavailable(`Redis command timed out after ${this.commandTimeoutMs}ms`),
              ),
            this.commandTimeoutMs,
          );
        }),
      ]);
    } catch (error) {
      if (error instanceof CacheUnavailable) throw error;
      throw new CacheUnavailable("Redis command failed", { cause: error });
    } finally {
      clearTimeout(timer);
    }
  }

  /** At most one log line a minute, so an outage doesn't flood the logs. */
  private logError(error: unknown) {
    if (Date.now() - this.lastErrorLog < 60_000) return;
    this.lastErrorLog = Date.now();
    console.error("Search cache (Redis) unavailable; searching stores live", error);
  }
}
