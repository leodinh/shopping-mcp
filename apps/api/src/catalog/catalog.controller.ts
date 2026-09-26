import { Controller, Get, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { ZodError } from "zod";
import { searchProducts } from "@shopping-mcp/application";

@Controller("api/products")
export class CatalogController {
  @Get()
  async search(@Query() query: Record<string, string>, @Res() res: Response) {
    try {
      res.json(await searchProducts(query));
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
