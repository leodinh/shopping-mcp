import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createApi } from "../../src/create-api";

let app: Awaited<ReturnType<typeof createApi>>;
const realFetch = globalThis.fetch;
before(async () => {
  // This suite runs against the migrated dev database, which may hold connected stores: answer
  // every Shopify call here so a test run never reaches a real shop (or refreshes its tokens).
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (!url.hostname.endsWith(".myshopify.com")) return realFetch(input, init);
    if (url.pathname.endsWith("/admin/oauth/access_token")) {
      return Response.json({ error: "invalid_grant" }, { status: 503 });
    }
    return Response.json({
      data: {
        shop: { currencyCode: "USD" },
        products: { edges: [], pageInfo: { hasNextPage: false, endCursor: null } },
        nodes: [],
      },
    });
  }) as typeof fetch;
  app = await createApi();
});
after(async () => {
  globalThis.fetch = realFetch;
  await app.close();
});

type RpcResponse = {
  result?: {
    tools?: Array<{ name: string; inputSchema: { properties: Record<string, { type?: string }> } }>;
    isError?: boolean;
    content?: Array<{ text: string }>;
    structuredContent?: Record<string, unknown>;
  };
  error?: { message: string };
};

/** One JSON-RPC call to /api/mcp, the way an assistant's MCP client makes it. */
async function rpc(method: string, params: Record<string, unknown>): Promise<RpcResponse> {
  const response = await request(app.getHttpServer())
    .post("/api/mcp")
    .set("Accept", "application/json, text/event-stream")
    .send({ jsonrpc: "2.0", id: 1, method, params });
  assert.equal(response.status, 200, response.text);
  const sse = response.text.match(/^data: (.+)$/m);
  return JSON.parse(sse ? sse[1] : response.text) as RpcResponse;
}

const call = (name: string, args: Record<string, unknown>) =>
  rpc("tools/call", { name, arguments: args });

test("agents see the catalog's own search schema: maxPrice is a number", async () => {
  const { result } = await rpc("tools/list", {});
  const tools = new Map(result?.tools?.map((tool) => [tool.name, tool]));
  assert.deepEqual([...tools.keys()].sort(), [
    "compare_products",
    "get_account",
    "get_checkout",
    "get_product",
    "search_products",
  ]);
  const search = tools.get("search_products")!.inputSchema.properties;
  assert.equal(search.maxPrice.type, "number");
  assert.equal(search.inStock.type, "boolean");
  assert.equal(search.cursor.type, "string");
  assert.equal(search.offset, undefined, "paging is by cursor now");
});

test("search_products accepts any non-negative price an agent sends", async () => {
  for (const maxPrice of [19.999, 0.1 + 0.2, 1e21]) {
    const { result } = await call("search_products", {
      q: "mug",
      currency: "USD",
      maxPrice,
      inStock: true,
    });
    assert.notEqual(result?.isError, true, `${maxPrice}: ${result?.content?.[0]?.text}`);
    assert.ok(Array.isArray(result?.structuredContent?.products));
    assert.equal(typeof result?.structuredContent?.hasMore, "boolean");
  }
});

test("search_products tells the agent to set currency with maxPrice", async () => {
  const response = await call("search_products", { q: "mug", maxPrice: 20 });
  const message = response.error?.message ?? response.result?.content?.[0]?.text ?? "";
  assert.match(message, /Set currency when using maxPrice/);
});

test("compare_products rejects duplicate IDs up front; get_product reports a missing product", async () => {
  const id = `shopify:${randomUUID()}:42`;
  const duplicate = await call("compare_products", { productIds: [id, id.toUpperCase()] });
  assert.ok(duplicate.error || duplicate.result?.isError, JSON.stringify(duplicate));

  const old = await call("get_product", { productId: randomUUID() });
  assert.ok(old.error || old.result?.isError, "internal UUIDs are no longer product IDs");

  const missing = await call("get_product", { productId: `shopify:${randomUUID()}:1` });
  assert.equal(missing.result?.isError, true);
  assert.equal(missing.result?.content?.[0]?.text, "Product not found.");
});

test("REST search still takes query strings, and pages by cursor", async () => {
  const server = app.getHttpServer();
  const ok = await request(server).get(
    "/api/products?currency=USD&maxPrice=19.999&inStock=true&limit=5&country=US",
  );
  assert.equal(ok.status, 200, ok.text);
  assert.ok(Array.isArray(ok.body.products));
  assert.equal(typeof ok.body.hasMore, "boolean");
  assert.equal(typeof ok.body.partial, "boolean");
  assert.ok(Array.isArray(ok.body.unavailable));
  for (const query of ["currency=USD&maxPrice=cheap", "maxPrice=10", "cursor=forged.cursor"]) {
    assert.equal((await request(server).get(`/api/products?${query}`)).status, 400, query);
  }
  assert.equal((await request(server).get("/api/products?q=mug")).status, 200);
});
