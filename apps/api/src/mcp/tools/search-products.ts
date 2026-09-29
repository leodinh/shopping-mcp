import type { z } from "zod";
import { searchSchema } from "@shopping-mcp/contracts";
import { searchProducts } from "@shopping-mcp/commerce/catalog";
import { catalogToolError, dataResult } from "./responses";

export const searchProductsTool = {
  title: "Search Products",
  description:
    "Find products using keywords, price, merchant, and availability. maxPrice is in major units (19.99 = $19.99).",
  inputSchema: searchSchema,
};

export async function runSearchProductsTool(input: z.output<typeof searchSchema>) {
  try {
    return dataResult(await searchProducts(input));
  } catch (error) {
    return catalogToolError(error);
  }
}
