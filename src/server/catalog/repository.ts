import { minorUnits, searchSchema, type CatalogProduct } from "@/shared/catalog-schema";
import type { Pool } from "pg";
import { database } from "@/server/db/client";

export async function searchProducts(input: unknown, pool: Pool = database()) {
  const filters = searchSchema.parse(input);
  const parameters: unknown[] = [filters.q, filters.merchantId ?? null, filters.currency,
    filters.maxPrice === undefined ? null : minorUnits(filters.maxPrice), filters.inStock === "true"];
  const where = `p.active
    AND ($1 = '' OR p.search_document @@ websearch_to_tsquery('english', $1))
    AND ($2::uuid IS NULL OR p.merchant_id = $2::uuid)
    AND p.currency = $3
    AND ($4::bigint IS NULL OR p.price_minor <= $4::bigint)
    AND (NOT $5::boolean OR p.inventory > 0)`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const count = await client.query(`SELECT count(*)::int AS total FROM products p WHERE ${where}`, parameters);
    const result = await client.query(`
      SELECT p.id, p.external_id AS "externalId", p.name, p.description,
        p.price_minor AS "priceMinor", p.currency, p.images, p.inventory,
        p.product_url AS "productUrl", p.updated_at AS "updatedAt",
        json_build_object('id', m.id, 'name', m.name, 'slug', m.slug) AS merchant
      FROM products p JOIN merchants m ON m.id = p.merchant_id
      WHERE ${where}
      ORDER BY ts_rank(p.search_document, websearch_to_tsquery('english', $1)) DESC, p.name, p.id
      LIMIT $6 OFFSET $7
    `, [...parameters, filters.limit, filters.offset]);
    await client.query("COMMIT");
    return { products: result.rows as CatalogProduct[], total: count.rows[0].total as number,
      limit: filters.limit, offset: filters.offset };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
