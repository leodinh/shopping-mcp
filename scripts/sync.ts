import { database } from "@/server/db/client";
import { syncConnection } from "@/server/sync/service";

async function main() {
  const pool = database();
  try {
    const slug = process.argv[2];
    const connections = await pool.query(`
      SELECT c.id, m.slug FROM merchant_connections c JOIN merchants m ON m.id = c.merchant_id
      WHERE c.enabled AND ($1::text IS NULL OR m.slug = $1) ORDER BY m.slug
    `, [slug ?? null]);
    if (!connections.rowCount) throw new Error("No enabled connections found. Run db:seed or check the merchant slug.");
    for (const connection of connections.rows) {
      try {
        console.log(connection.slug, await syncConnection(connection.id, pool));
      } catch (error) {
        console.error(connection.slug, error);
        process.exitCode = 1;
      }
    }
  } finally {
    await pool.end();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
