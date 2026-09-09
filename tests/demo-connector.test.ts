import test from "node:test";
import assert from "node:assert/strict";
import { demoConnector } from "@/server/connectors/demo";
import { demoCatalog } from "@/server/demo/catalog";

test("demo connector maps the external API into the normalized contract", async (context) => {
  context.mock.method(globalThis, "fetch", async (input: URL) => {
    assert.equal(input.pathname, "/stores/northline/products");
    return Response.json(demoCatalog("northline"));
  });
  const products = await demoConnector.fetchCatalog({ storeSlug: "northline" });
  assert.equal(products.length, 4);
  assert.equal(products[0].externalId, "backpack");
  assert.equal(products[0].priceMinor, 8900);
  assert.equal(products[0].currency, "USD");
});

test("demo connector refuses incomplete responses, bad status and invalid config", async (context) => {
  const fetchMock = context.mock.method(globalThis, "fetch", async () => Response.json({ complete: false, products: [] }));
  await assert.rejects(demoConnector.fetchCatalog({ storeSlug: "northline" }));
  fetchMock.mock.mockImplementation(async () => new Response(null, { status: 503 }));
  await assert.rejects(demoConnector.fetchCatalog({ storeSlug: "northline" }), /HTTP 503/);
  await assert.rejects(demoConnector.fetchCatalog({ storeSlug: "../secret" }));
});
