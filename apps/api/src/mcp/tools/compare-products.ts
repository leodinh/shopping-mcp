import { z } from "zod";
import { productIdsSchema, productPageUrl } from "@shopping-mcp/contracts";
import { webOrigin } from "@shopping-mcp/config";
import { compareProducts } from "@shopping-mcp/commerce/catalog";
import { catalogToolError, dataResult } from "./responses";

export const compareProductsInput = z.object({
  productIds: productIdsSchema,
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional()
    .describe("ISO 3166 country of the buyer, for that market's prices."),
});

export const compareProductsTool = {
  title: "Compare Products",
  description:
    "Retrieve consistent, live details for 2–5 products (IDs from search) so an assistant can explain differences.",
  inputSchema: compareProductsInput,
};

export async function runCompareProductsTool(input: z.infer<typeof compareProductsInput>) {
  try {
    const result = await compareProducts(input.productIds, input);
    return dataResult({
      ...result,
      products: result.products.map((product) => ({
        ...product,
        pageUrl: productPageUrl(webOrigin(), product.id),
      })),
    });
  } catch (error) {
    return catalogToolError(error);
  }
}
