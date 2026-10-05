import { Controller, Get, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { ZodError } from "zod";
import { searchSchema } from "@shopping-mcp/contracts";
import { searchProducts } from "@shopping-mcp/commerce/catalog";

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
    offset: asNumber(query.offset),
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
      console.error("Catalog search failed", error);
      res.status(503).json({ error: "Catalog unavailable. Check database setup." });
    }
  }
}
