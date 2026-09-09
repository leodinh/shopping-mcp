import { database } from "@/server/db/client";
import { demoStores } from "@/shared/demo-stores";

async function main() {
  const pool = database();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const store of demoStores) {
      const result = await client.query(`
        INSERT INTO merchants (slug, name, website_url) VALUES ($1, $2, $3)
        ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, website_url = EXCLUDED.website_url RETURNING id
      `, [store.slug, store.name, store.websiteUrl]);
      await client.query(`
        INSERT INTO merchant_connections (merchant_id, connector_type, config) VALUES ($1, 'demo', $2::jsonb)
        ON CONFLICT (merchant_id) DO NOTHING
      `, [result.rows[0].id, JSON.stringify({ storeSlug: store.slug })]);
    }
    await client.query("COMMIT");
    console.log("Seeded 3 merchants and their connections. Run npm run sync to import products.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
