import type { z } from "zod";
import { browseUrl, productPageUrl, searchSchema } from "@shopping-mcp/contracts";
import { webOrigin } from "@shopping-mcp/config";
import { searchProducts } from "@shopping-mcp/commerce/catalog";
import { catalogToolError, dataResult } from "./responses";

export const searchProductsTool = {
  title: "Search Products",
  description:
    "Find products across connected stores, live. Filter by keywords, merchant, buyer country, currency, maxPrice (major units: 19.99 = $19.99) and stock. For more results, call again with the same parameters plus `cursor` set to `nextCursor`. `partial` with `unavailable` lists stores that didn't answer this time. Share `browseUrl` so the shopper can see these results on the web; each product's `pageUrl` opens it there.",
  inputSchema: searchSchema,
};

export async function runSearchProductsTool(input: z.output<typeof searchSchema>) {
  try {
    const result = await searchProducts(input);
    return dataResult({
      ...result,
      products: result.products.map((product) => ({
        ...product,
        pageUrl: productPageUrl(webOrigin(), product.id),
      })),
      browseUrl: browseUrl(webOrigin(), input),
    });
  } catch (error) {
    return catalogToolError(error);
  }
}
