import type { CatalogProduct } from "@shopping-mcp/contracts";

export type CatalogProductRow = Omit<CatalogProduct, "updatedAt"> & { updatedAt: Date };

export function toCatalogProduct(row: CatalogProductRow): CatalogProduct {
  return { ...row, updatedAt: row.updatedAt.toISOString() };
}
