import { z } from "zod";
import { productIdSchema } from "@shopping-mcp/contracts";
import { getCheckout } from "@shopping-mcp/commerce/catalog";
import { catalogToolError, dataResult, textResult } from "./responses";

export const getCheckoutInput = z.object({
  productId: productIdSchema,
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional()
    .describe("ISO 3166 country of the buyer, for that market's price."),
});

const refusals = {
  not_found: "Product not found.",
  unavailable: "This product isn't available to buy right now.",
  store_unavailable:
    "The store didn't answer, so the current offer can't be confirmed. Try again shortly.",
} as const;

export const getCheckoutTool = {
  title: "Get Checkout",
  description:
    "Confirm a product's current offer (live price and availability) and get where to buy it. Merchant checkout itself isn't integrated yet: use the product URL.",
  inputSchema: getCheckoutInput,
};

export async function runGetCheckoutTool(input: z.infer<typeof getCheckoutInput>) {
  try {
    const result = await getCheckout(input.productId, input);
    if (!result.ok) return textResult(refusals[result.reason], true);
    return dataResult(result.checkout);
  } catch (error) {
    return catalogToolError(error);
  }
}
