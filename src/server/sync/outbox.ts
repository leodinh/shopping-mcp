import { and, eq, inArray, sql } from "drizzle-orm";
import type { Pool } from "pg";
import { database, databaseFrom, pool, type Database } from "@/server/db/client";
import type { MerchantConnector } from "@/server/connectors/contract";
import { syncRuns } from "@/server/db/schema";
import { syncConnection } from "@/server/sync/service";

const STALE_MS = 10 * 60 * 1000;

export async function enqueueSync(connectionId: string, db: Database = database()) {
  const [existing] = await db
    .select({ id: syncRuns.id, status: syncRuns.status })
    .from(syncRuns)
    .where(
      and(eq(syncRuns.connectionId, connectionId), inArray(syncRuns.status, ["pending", "running"])),
    )
    .limit(1);
  if (existing) return existing;
  const [row] = await db
    .insert(syncRuns)
    .values({ connectionId, status: "pending" })
    .returning({ id: syncRuns.id, status: syncRuns.status });
  return row;
}

type DrainOptions = {
  limit?: number;
  pool?: Pool;
  connectorOverride?: MerchantConnector;
  staleAfterMs?: number;
};

export async function drainSyncRuns(options: DrainOptions = {}) {
  const source = options.pool ?? pool();
  const limit = options.limit ?? 1;
  const staleAfterMs = options.staleAfterMs ?? STALE_MS;
  const results: Array<{
    id: string;
    connectionId: string;
    status: "succeeded" | "failed";
    productCount: number | null;
    error: string | null;
  }> = [];

  for (let i = 0; i < limit; i++) {
    const claimed = await claimNextRun(source, staleAfterMs);
    if (!claimed) break;
    try {
      const outcome = await syncConnection(claimed.connectionId, source, options.connectorOverride);
      const [finished] = await databaseFrom(source)
        .update(syncRuns)
        .set({
          status: "succeeded",
          productCount: outcome.imported,
          error: null,
          finishedAt: sql`now()`,
        })
        .where(eq(syncRuns.id, claimed.id))
        .returning({
          id: syncRuns.id,
          connectionId: syncRuns.connectionId,
          status: syncRuns.status,
          productCount: syncRuns.productCount,
          error: syncRuns.error,
        });
      results.push({
        id: finished.id,
        connectionId: finished.connectionId,
        status: "succeeded",
        productCount: finished.productCount,
        error: null,
      });
    } catch (error) {
      const message = (error instanceof Error ? error.message : "Sync failed").slice(0, 2000);
      const [finished] = await databaseFrom(source)
        .update(syncRuns)
        .set({
          status: "failed",
          error: message,
          finishedAt: sql`now()`,
        })
        .where(eq(syncRuns.id, claimed.id))
        .returning({
          id: syncRuns.id,
          connectionId: syncRuns.connectionId,
          productCount: syncRuns.productCount,
          error: syncRuns.error,
        });
      results.push({
        id: finished.id,
        connectionId: finished.connectionId,
        status: "failed",
        productCount: finished.productCount,
        error: finished.error,
      });
    }
  }
  return results;
}

async function claimNextRun(source: Pool, staleAfterMs: number) {
  const db = databaseFrom(source);
  const staleSeconds = Math.max(1, Math.floor(staleAfterMs / 1000));
  const claimed = await db.execute<{ id: string; connection_id: string }>(sql`
    WITH next AS (
      SELECT id
      FROM sync_runs
      WHERE status = 'pending'
         OR (status = 'running' AND started_at < now() - make_interval(secs => ${staleSeconds}))
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE sync_runs AS run
    SET status = 'running',
        started_at = now(),
        error = null,
        finished_at = null
    FROM next
    WHERE run.id = next.id
    RETURNING run.id, run.connection_id
  `);
  const row = claimed.rows[0];
  if (!row) return null;
  return { id: row.id, connectionId: row.connection_id };
}
