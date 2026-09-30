import { z } from "zod";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { productIdsSchema, searchSchema, type SearchInput } from "@shopping-mcp/contracts";
import { toCatalogProduct } from "./dto";
import { database, merchants, products, type Database } from "@shopping-mcp/database";

const productIdSchema = z.uuid().transform((id) => id.toLowerCase());

const productSelect = {
  id: products.id,
  externalId: products.externalId,
  name: products.name,
  description: products.description,
  priceMinor: products.priceMinor,
  currency: products.currency,
  images: products.images,
  inventory: products.inventory,
  productUrl: products.productUrl,
  updatedAt: products.updatedAt,
  merchant: {
    id: merchants.id,
    name: merchants.name,
    slug: merchants.slug,
  },
};

const FRESH_FOR = "7 days";

// Served products: active, from an enabled connection that synced successfully within FRESH_FOR.
// A store whose syncs keep failing (expired access, uninstalled app) drops out instead of
// assistants quoting week-old prices and stock.
const servable = and(
  eq(products.active, true),
  sql`EXISTS (
    SELECT 1 FROM merchant_connections c
    WHERE c.merchant_id = ${products.merchantId}
      AND c.enabled
      AND c.last_synced_at > now() - ${FRESH_FOR}::interval
  )`,
);

function catalogWhere(filters: z.output<typeof searchSchema>) {
  const tsquery = sql`websearch_to_tsquery('english', ${filters.q})`;
  return and(
    servable,
    filters.q === "" ? undefined : sql`${products.searchDocument} @@ ${tsquery}`,
    filters.merchantId ? eq(products.merchantId, filters.merchantId) : undefined,
    filters.currency ? eq(products.currency, filters.currency) : undefined,
    filters.maxPrice === undefined
      ? undefined
      : // Exact decimal math in Postgres: 19.999 or 1e21 compare correctly, no JS float rounding.
        sql`${products.priceMinor} <= ${String(filters.maxPrice)}::numeric * 100`,
    filters.inStock ? gt(products.inventory, 0) : undefined,
  );
}

export async function searchProducts(input: SearchInput, db?: Database) {
  const filters = searchSchema.parse(input);
  const tsquery = sql`websearch_to_tsquery('english', ${filters.q})`;
  const where = catalogWhere(filters);
  return (db ?? database()).transaction(
    async (tx) => {
      const [countRow] = await tx
        .select({ total: sql<number>`cast(count(*) as int)` })
        .from(products)
        .where(where);
      const rows = await tx
        .select(productSelect)
        .from(products)
        .innerJoin(merchants, eq(products.merchantId, merchants.id))
        .where(where)
        .orderBy(
          desc(sql`ts_rank(${products.searchDocument}, ${tsquery})`),
          products.name,
          products.id,
        )
        .limit(filters.limit)
        .offset(filters.offset);
      return {
        products: rows.map(toCatalogProduct),
        total: countRow.total,
        limit: filters.limit,
        offset: filters.offset,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export async function getProductById(id: string, db?: Database) {
  const productId = productIdSchema.parse(id);
  const [row] = await (db ?? database())
    .select(productSelect)
    .from(products)
    .innerJoin(merchants, eq(products.merchantId, merchants.id))
    .where(and(servable, eq(products.id, productId)));
  return row ? toCatalogProduct(row) : null;
}

export async function compareProducts(ids: string[], db?: Database) {
  const productIds = productIdsSchema.parse(ids).map((id) => id.toLowerCase());
  const rows = await (db ?? database())
    .select(productSelect)
    .from(products)
    .innerJoin(merchants, eq(products.merchantId, merchants.id))
    .where(and(servable, inArray(products.id, productIds)));
  const byId = new Map(rows.map(toCatalogProduct).map((product) => [product.id, product]));
  return {
    products: productIds.flatMap((productId) => {
      const product = byId.get(productId);
      return product ? [product] : [];
    }),
    missingIds: productIds.filter((productId) => !byId.has(productId)),
  };
}

export async function getCheckout(id: string, db?: Database) {
  const product = await getProductById(id, db);
  if (!product) return null;
  return {
    supported: false as const,
    productId: product.id,
    merchant: product.merchant,
    checkoutUrl: null,
    productUrl: product.productUrl,
    message:
      "Merchant checkout is not integrated yet. Use the product URL until a real checkout exists.",
  };
}
