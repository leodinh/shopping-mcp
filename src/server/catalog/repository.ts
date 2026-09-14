import { z } from "zod";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { minorUnits, searchSchema, toCatalogProduct } from "@/shared/catalog-schema";
import { database, type Database } from "@/server/db/client";
import { merchants, products } from "@/server/db/schema";

const productIdSchema = z.uuid().transform((id) => id.toLowerCase());
const productIdsSchema = z
  .array(productIdSchema)
  .min(2)
  .max(5)
  .refine((ids) => new Set(ids).size === ids.length, "Product IDs must be unique");

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

function catalogWhere(filters: ReturnType<typeof searchSchema.parse>) {
  const tsquery = sql`websearch_to_tsquery('english', ${filters.q})`;
  return and(
    eq(products.active, true),
    filters.q === "" ? undefined : sql`${products.searchDocument} @@ ${tsquery}`,
    filters.merchantId ? eq(products.merchantId, filters.merchantId) : undefined,
    eq(products.currency, filters.currency),
    filters.maxPrice === undefined
      ? undefined
      : sql`${products.priceMinor} <= ${minorUnits(filters.maxPrice)}::bigint`,
    filters.inStock === "true" ? gt(products.inventory, 0) : undefined,
  );
}

export async function searchProducts(input: unknown, db?: Database) {
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
    .where(and(eq(products.active, true), eq(products.id, productId)));
  return row ? toCatalogProduct(row) : null;
}

export async function compareProducts(ids: string[], db?: Database) {
  const productIds = productIdsSchema.parse(ids);
  const rows = await (db ?? database())
    .select(productSelect)
    .from(products)
    .innerJoin(merchants, eq(products.merchantId, merchants.id))
    .where(and(eq(products.active, true), inArray(products.id, productIds)));
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
