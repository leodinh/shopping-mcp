import type { z } from "zod";
import { searchSchema } from "@shopping-mcp/contracts";
import { searchProducts } from "@shopping-mcp/commerce/catalog";
import { catalogToolError, dataResult } from "./responses";

export const searchProductsTool = {
  title: "Search Products",
  description:
    "Find products across connected stores, live. Filter by keywords, merchant, buyer country, currency, maxPrice (major units: 19.99 = $19.99) and stock. For more results, call again with the same parameters plus `cursor` set to `nextCursor`. `partial` with `unavailable` lists stores that didn't answer this time.",
  inputSchema: searchSchema,
};

export async function runSearchProductsTool(input: z.output<typeof searchSchema>) {
  try {
    return dataResult(await searchProducts(input));
  } catch (error) {
    return catalogToolError(error);
  }
}
