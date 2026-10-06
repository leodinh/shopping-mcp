import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createApi } from "../../src/create-api";

let app: Awaited<ReturnType<typeof createApi>>;
before(async () => (app = await createApi()));
after(() => app.close());

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
    "get_checkout",
    "get_product",
    "search_products",
  ]);
  const search = tools.get("search_products")!.inputSchema.properties;
  assert.equal(search.maxPrice.type, "number");
  assert.equal(search.inStock.type, "boolean");
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
  }
});

test("search_products tells the agent to set currency with maxPrice", async () => {
  const response = await call("search_products", { q: "mug", maxPrice: 20 });
  const message = response.error?.message ?? response.result?.content?.[0]?.text ?? "";
  assert.match(message, /Set currency when using maxPrice/);
});

test("compare_products rejects duplicate IDs up front; get_product reports a missing product", async () => {
  const id = randomUUID();
  const duplicate = await call("compare_products", { productIds: [id, id.toUpperCase()] });
  assert.ok(duplicate.error || duplicate.result?.isError, JSON.stringify(duplicate));

  const missing = await call("get_product", { productId: randomUUID() });
  assert.equal(missing.result?.isError, true);
  assert.equal(missing.result?.content?.[0]?.text, "Product not found.");
});

test("REST search still takes query strings", async () => {
  const server = app.getHttpServer();
  const ok = await request(server).get(
    "/api/products?currency=USD&maxPrice=19.999&inStock=true&limit=5",
  );
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.body.limit, 5);
  for (const query of ["currency=USD&maxPrice=cheap", "maxPrice=10"]) {
    assert.equal((await request(server).get(`/api/products?${query}`)).status, 400, query);
  }
  assert.equal((await request(server).get("/api/products?q=mug")).status, 200);
});
