import { handleShopifyCallback } from "@/server/shopify/callback";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleShopifyCallback(request);
}
