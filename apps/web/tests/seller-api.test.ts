import test from "node:test";
import assert from "node:assert/strict";
import { fetchSeller } from "../src/features/seller/api";

test("seller client includes credentials and accepts a signed-out response", async (context) => {
  const controller = new AbortController();
  context.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
    assert.equal(options.credentials, "include");
    assert.equal(options.signal, controller.signal);
    return Response.json({ merchant: null });
  });
  assert.deepEqual(await fetchSeller(controller.signal), { merchant: null });
});

test("seller client rejects HTTP errors and malformed successful responses", async (context) => {
  const fetch = context.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 503 }),
  );
  await assert.rejects(() => fetchSeller(), /Store status unavailable/);
  fetch.mock.mockImplementation(async () => Response.json({ merchant: { id: "broken" } }));
  await assert.rejects(() => fetchSeller());
});
