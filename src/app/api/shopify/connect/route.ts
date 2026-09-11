import { handleShopifyConnect } from "@/server/shopify/connect";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleShopifyConnect(request);
}
