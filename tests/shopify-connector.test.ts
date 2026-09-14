import test from "node:test";
import assert from "node:assert/strict";
import { getConnector } from "@/server/connectors/registry";
import { mapShopifyProduct, shopifyConnector } from "@/server/connectors/shopify";

test("mapShopifyProduct uses first variant price and inventory", () => {
  assert.deepEqual(
    mapShopifyProduct(
      {
        id: "gid://shopify/Product/42",
        title: " Stone mug ",
        description: "Ceramic",
        handle: "stone-mug",
        onlineStoreUrl: null,
        images: { nodes: [{ url: "https://cdn.example/mug.jpg" }] },
        variants: {
          nodes: [{ price: "12.00", inventoryQuantity: 3 }],
        },
      },
      "demo.myshopify.com",
      "USD",
    ),
    {
      externalId: "42",
      name: "Stone mug",
      description: "Ceramic",
      priceMinor: 1200,
      currency: "USD",
      images: ["https://cdn.example/mug.jpg"],
      inventory: 3,
      productUrl: "https://demo.myshopify.com/products/stone-mug",
    },
  );
});

test("shopify fetchCatalog paginates and stops at maxProducts", async () => {
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls += 1;
    const nodes = Array.from({ length: 50 }, (_, index) => ({
      id: `gid://shopify/Product/${calls * 1000 + index}`,
      title: `P${calls}-${index}`,
      description: "",
      handle: `p-${calls}-${index}`,
      onlineStoreUrl: `https://demo.myshopify.com/products/p-${calls}-${index}`,
      images: { nodes: [] },
      variants: { nodes: [{ price: "1.00", inventoryQuantity: 1 }] },
    }));
    return new Response(
      JSON.stringify({
        data: {
          shop: { currencyCode: "USD" },
          products: {
            nodes,
            pageInfo: { hasNextPage: true, endCursor: `c${calls}` },
          },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const catalog = await shopifyConnector.fetchCatalog(
      { shop: "demo.myshopify.com", accessToken: "shpat_test" },
      { pageSize: 50, maxProducts: 75 },
    );
    assert.equal(catalog.length, 75);
    assert.equal(calls, 2);
    assert.equal(catalog[0].externalId, "1000");
    assert.equal(catalog[74].priceMinor, 100);
  } finally {
    globalThis.fetch = original;
  }
});

test("getConnector returns the shopify connector", () => {
  assert.equal(getConnector("shopify").type, "shopify");
});
