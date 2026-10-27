import { z } from "zod";
import { productIdSchema, productPageUrl } from "@shopping-mcp/contracts";
import { webOrigin } from "@shopping-mcp/config";
import { getProduct } from "@shopping-mcp/commerce/catalog";
import { catalogToolError, dataResult, textResult } from "./responses";

export const getProductInput = z.object({
  productId: productIdSchema,
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional()
    .describe("ISO 3166 country of the buyer, for that market's price."),
});

export const getProductTool = {
  title: "Get Product",
  description: "Retrieve one product, live from its store, by the ID search returned.",
  inputSchema: getProductInput,
};

export async function runGetProductTool(input: z.infer<typeof getProductInput>) {
  try {
    const { product, unavailable } = await getProduct(input.productId, input);
    if (unavailable.length) return textResult("The store didn't answer. Try again shortly.", true);
    if (!product) return textResult("Product not found.", true);
    return dataResult({
      product: { ...product, pageUrl: productPageUrl(webOrigin(), product.id) },
    });
  } catch (error) {
    return catalogToolError(error);
  }
}
