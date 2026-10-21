import test from "node:test";
import assert from "node:assert/strict";
import {
  mapShopifyProduct,
  searchTerms,
  shopifySearchQuery,
  ShopifyProductProvider,
  type ShopifyProductNode,
} from "../src/connectors/shopify/provider";

const merchant = { id: "00000000-0000-4000-8000-000000000001", name: "Northline", slug: "n" };
const shop = "northline.myshopify.com";
const signal = new AbortController().signal;

function node(overrides: Partial<ShopifyProductNode> = {}): ShopifyProductNode {
  return {
    id: "gid://shopify/Product/42",
    title: " Stone mug ",
    description: "Ceramic",
    handle: "stone-mug",
    status: "ACTIVE",
    vendor: "Fieldwork",
    onlineStoreUrl: "https://northline.example/products/stone-mug",
    media: { nodes: [{ image: { url: "https://cdn.example/mug.jpg" } }, {}] },
    variants: {
      nodes: [
        {
          id: "gid://shopify/ProductVariant/1",
          title: "Large",
          price: "18.00",
          availableForSale: false,
          barcode: "0123456789012",
          sku: "MUG-L",
        },
        {
          id: "gid://shopify/ProductVariant/2",
          title: "Small",
          price: "12.50",
          availableForSale: true,
          barcode: null,
          sku: null,
        },
      ],
    },
    ...overrides,
  };
}

/** A provider whose GraphQL calls are answered by `answer`, recording each call's variables. */
function provider(answer: (variables: Record<string, unknown>) => unknown) {
  const calls: Array<Record<string, unknown>> = [];
  const graphql = async <T>(_query: string, variables: Record<string, unknown>) => {
    calls.push(variables);
    return answer(variables) as T;
  };
  return { provider: new ShopifyProductProvider(merchant, shop, graphql), calls };
}

test("a shopper's words are quoted, so they can never become Shopify filters or operators", () => {
  assert.equal(searchTerms('black "backpack"'), '"black" "backpack"');
  assert.equal(searchTerms("status:draft OR x"), '"status:draft" "OR" "x"');
  assert.equal(searchTerms('a\\" b'), '"a" "b"');
  assert.equal(searchTerms("   "), "");
});

test("only active products published to the online store are searched; ceilings use Shopify's price", () => {
  const base = { q: "mug", inStock: false, first: 10 };
  assert.equal(shopifySearchQuery(base), '"mug" AND status:active AND published_status:published');
  assert.equal(
    shopifySearchQuery({ ...base, q: "", currency: "USD", maxPriceMinor: 1999 }),
    "status:active AND published_status:published AND price:<=19.99",
  );
  // With a buyer country the market price differs from the base price: checked after fetching.
  assert.doesNotMatch(
    shopifySearchQuery({ ...base, country: "CA", currency: "CAD", maxPriceMinor: 1999 }),
    /price/,
  );
});

test("a product is normalized from its cheapest variant and is available if any variant is", () => {
  assert.deepEqual(mapShopifyProduct(node(), shop, "USD"), {
    provider: "shopify",
    externalId: "42",
    name: "Stone mug",
    description: "Ceramic",
    price: { amountMinor: 1250, currency: "USD" },
    available: true,
    brand: "Fieldwork",
    gtin: "0123456789012",
    sku: "MUG-L",
    images: ["https://cdn.example/mug.jpg"],
    productUrl: "https://northline.example/products/stone-mug",
    variants: [
      { id: "1", title: "Large", price: { amountMinor: 1800, currency: "USD" }, available: false },
      { id: "2", title: "Small", price: { amountMinor: 1250, currency: "USD" }, available: true },
    ],
  });
});

test("market prices, yen, odd barcodes, drafts and malformed prices are handled per product", () => {
  const contextual = node({
    variants: {
      nodes: [
        {
          ...node().variants.nodes[1],
          barcode: "not-a-gtin",
          contextualPricing: { price: { amount: "17.00", currencyCode: "CAD" } },
        },
      ],
    },
  });
  const mapped = mapShopifyProduct(contextual, shop, "USD")!;
  assert.deepEqual(mapped.price, { amountMinor: 1700, currency: "CAD" });
  assert.equal(mapped.gtin, null);

  const yen = node({ variants: { nodes: [{ ...node().variants.nodes[1], price: "1500.0" }] } });
  assert.deepEqual(mapShopifyProduct(yen, shop, "JPY")!.price, {
    amountMinor: 1500,
    currency: "JPY",
  });

  assert.equal(mapShopifyProduct(node({ status: "DRAFT" }), shop, "USD"), null);
  const finer = node({ variants: { nodes: [{ ...node().variants.nodes[1], price: "1500.5" }] } });
  assert.equal(mapShopifyProduct(finer, shop, "JPY"), null, "skipped, not thrown");
  assert.equal(mapShopifyProduct(node({ variants: { nodes: [] } }), shop, "USD"), null);
});

test("search returns each matching product with its own cursor, plus the page's end", async () => {
  const { provider: store, calls } = provider(() => ({
    shop: { currencyCode: "USD" },
    products: {
      edges: [
        { cursor: "c1", node: node() },
        { cursor: "c2", node: node({ id: "gid://shopify/Product/43", status: "DRAFT" }) },
        {
          cursor: "c3",
          node: node({
            id: "gid://shopify/Product/44",
            variants: { nodes: [{ ...node().variants.nodes[0] }] }, // sold out
          }),
        },
      ],
      pageInfo: { hasNextPage: true, endCursor: "c3" },
    },
  }));
  const page = await store.search({ q: "mug", inStock: true, first: 3, after: "c0" }, signal);
  assert.deepEqual(
    page.items.map((item) => [item.product.externalId, item.cursor]),
    [["42", "c1"]],
  );
  assert.equal(page.end, "c3");
  assert.equal(page.hasMore, true);
  assert.equal(calls[0].after, "c0");
  assert.equal(calls[0].sortKey, "RELEVANCE");
  assert.equal(calls[0].hasCountry, false);

  await store.search({ q: "", inStock: false, first: 3, country: "CA", currency: "USD" }, signal);
  assert.equal(calls[1].sortKey, null, "no relevance sort without search terms");
  assert.deepEqual([calls[1].country, calls[1].hasCountry], ["CA", true]);
});

test("search drops products in another currency than asked for", async () => {
  const { provider: store } = provider(() => ({
    shop: { currencyCode: "EUR" },
    products: { edges: [{ cursor: "c1", node: node() }], pageInfo: { hasNextPage: false } },
  }));
  const page = await store.search({ q: "", inStock: false, first: 5, currency: "USD" }, signal);
  assert.deepEqual(page.items, []);
  assert.equal(page.hasMore, false);
});

test("get asks Shopify with search's own rule, narrowed to the IDs", async () => {
  const { provider: store, calls } = provider(() => ({
    shop: { currencyCode: "USD" },
    products: {
      edges: [{ node: node() }, { node: node({ id: "gid://shopify/Product/9", status: "DRAFT" }) }],
    },
  }));
  const products = await store.get(["42", "9", "gid://shopify/Product/1 OR x"], {}, signal);
  assert.deepEqual(
    products.map((product) => product.externalId),
    ["42"],
  );
  assert.equal(
    calls[0].query,
    "(id:42 OR id:9) AND status:active AND published_status:published",
    "non-numeric IDs never reach the query",
  );
  assert.equal(calls[0].first, 2);
  assert.deepEqual(await store.get([], {}, signal), []);
});
