import { z } from "zod";
import { getCheckout } from "@/server/catalog/repository";
import { catalogToolError, dataResult, textResult } from "./responses";

export const getCheckoutInput = z.object({
  productId: z.uuid(),
});

export const getCheckoutTool = {
  title: "Get Checkout",
  description:
    "Create or retrieve a merchant checkout URL. Demo merchants are unsupported until a real checkout integration exists.",
  inputSchema: getCheckoutInput,
};

export async function runGetCheckoutTool(input: z.infer<typeof getCheckoutInput>) {
  try {
    const checkout = await getCheckout(input.productId);
    if (!checkout) return textResult("Product not found.", true);
    return dataResult(checkout);
  } catch (error) {
    return catalogToolError(error);
  }
}
