import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { Pool } from "pg";
import { databaseUrl } from "@shopping-mcp/config";
import { databaseFrom } from "./client";

const migrations = new URL("../migrations/", import.meta.url);

// Test-only: a throwaway Postgres schema with every migration applied.
export async function createTestDatabase(prefix = "test") {
  const schema = `${prefix}_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl() });
  const pool = new Pool({ connectionString: databaseUrl(), options: `-c search_path=${schema}` });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const files = (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = await readFile(new URL(file, migrations), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed) await pool.query(trimmed.replaceAll('"public".', ""));
    }
  }
  return {
    pool,
    db: databaseFrom(pool),
    async drop() {
      await pool.end();
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    },
  };
}
