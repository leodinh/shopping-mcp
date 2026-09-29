import { Controller, Get, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { z, ZodError } from "zod";
import { searchSchema } from "@shopping-mcp/contracts";
import { searchProducts } from "@shopping-mcp/commerce/catalog";

// The only place query strings exist: turn them into the catalog's real types, same bounds.
const fromString = (parse: (value: string) => unknown) => (value: unknown) =>
  typeof value === "string" && value !== "" ? parse(value) : value;
const { maxPrice, inStock, limit, offset } = searchSchema.shape;
const searchQuerySchema = searchSchema.extend({
  maxPrice: z.preprocess(fromString(Number), maxPrice),
  inStock: z.preprocess(
    fromString((value) => (value === "true" ? true : value === "false" ? false : value)),
    inStock,
  ),
  limit: z.preprocess(fromString(Number), limit),
  offset: z.preprocess(fromString(Number), offset),
});

@Controller("api/products")
export class CatalogController {
  @Get()
  async search(@Query() query: Record<string, string>, @Res() res: Response) {
    try {
      res.json(await searchProducts(searchQuerySchema.parse(query)));
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
