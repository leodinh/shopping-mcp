import { Controller, Get, Param, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { ZodError } from "zod";
import { productIdSchema, searchSchema } from "@shopping-mcp/contracts";
import {
  AllStoresUnavailable,
  getProduct,
  InvalidCursor,
  searchProducts,
} from "@shopping-mcp/commerce/catalog";

// The only place query strings exist: turn them into the catalog's real types, then validate
// with the catalog's own schema (same bounds, same rules).
const asNumber = (value: string | undefined) =>
  value === undefined || value === "" ? undefined : Number(value);
const asBoolean = (value: string | undefined) =>
  value === "true" ? true : value === "false" ? false : value;

function fromQueryString(query: Record<string, string>) {
  return {
    ...query,
    maxPrice: asNumber(query.maxPrice),
    inStock: asBoolean(query.inStock),
    limit: asNumber(query.limit),
  };
}

@Controller("api/products")
export class CatalogController {
  @Get()
  async search(@Query() query: Record<string, string>, @Res() res: Response) {
    try {
      res.json(await searchProducts(searchSchema.parse(fromQueryString(query))));
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: "Invalid search parameters", issues: error.issues });
        return;
      }
      if (error instanceof InvalidCursor) {
        res.status(400).json({ error: error.message });
        return;
      }
      if (error instanceof AllStoresUnavailable) {
        res.status(503).json({ error: "No store could be reached right now. Try again shortly." });
        return;
      }
      console.error("Catalog search failed", error);
      res.status(503).json({ error: "Catalog unavailable right now. Try again shortly." });
    }
  }

  /** One product, live from its store: the product page's data. */
  @Get(":id")
  async product(
    @Param("id") id: string,
    @Query("country") country: string | undefined,
    @Res() res: Response,
  ) {
    if (!productIdSchema.safeParse(id).success) {
      res.status(400).json({ error: "Not a product ID" });
      return;
    }
    if (country !== undefined && !/^[A-Z]{2}$/.test(country)) {
      res.status(400).json({ error: "Invalid country" });
      return;
    }
    try {
      const { product, unavailable } = await getProduct(id, { country });
      console.log("product", product);
      console.log("unavailable", unavailable);
      if (unavailable.length) {
        res.status(503).json({ error: "The store didn't answer. Try again shortly." });
        return;
      }
      if (!product) {
        res.status(404).json({ error: "Product not found" });
        return;
      }
      res.json({ product });
    } catch (error) {
      console.error("Product lookup failed", error);
      res.status(503).json({ error: "Catalog unavailable right now. Try again shortly." });
    }
  }
}
