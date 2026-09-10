import { z } from "zod";
import { compareProducts } from "@/server/catalog/repository";
import { catalogToolError, dataResult } from "./responses";

export const compareProductsInput = z.object({
  productIds: z.array(z.uuid()).min(2).max(5),
});

export const compareProductsTool = {
  title: "Compare Products",
  description: "Retrieve consistent details for 2–5 products so an assistant can explain differences.",
  inputSchema: compareProductsInput,
};

export async function runCompareProductsTool(input: z.infer<typeof compareProductsInput>) {
  try {
    return dataResult(await compareProducts(input.productIds));
  } catch (error) {
    return catalogToolError(error);
  }
}
