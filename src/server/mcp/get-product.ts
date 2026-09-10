import { z } from "zod";
import { getProductById } from "@/server/catalog/repository";
import { catalogToolError, dataResult, textResult } from "./responses";

export const getProductInput = z.object({
  productId: z.uuid(),
});

export const getProductTool = {
  title: "Get Product",
  description: "Retrieve one product by its internal ID.",
  inputSchema: getProductInput,
};

export async function runGetProductTool(input: z.infer<typeof getProductInput>) {
  try {
    const product = await getProductById(input.productId);
    if (!product) return textResult("Product not found.", true);
    return dataResult({ product });
  } catch (error) {
    return catalogToolError(error);
  }
}
