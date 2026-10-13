import test from "node:test";
import assert from "node:assert/strict";
import { fetchSeller, loadSeller } from "../src/features/profile/api";

test("seller client includes credentials and reads 401 as no valid session", async (context) => {
  const controller = new AbortController();
  context.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
    assert.equal(options.credentials, "include");
    assert.equal(options.signal, controller.signal);
    return Response.json({ error: "Sign in to see your profile." }, { status: 401 });
  });
  assert.equal(await fetchSeller(controller.signal), null);
});

test("seller client rejects HTTP errors and malformed successful responses", async (context) => {
  const fetch = context.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 503 }),
  );
  await assert.rejects(() => fetchSeller(), /Store status unavailable/);
  fetch.mock.mockImplementation(async () => Response.json({ user: null, stores: [] }));
  await assert.rejects(() => fetchSeller());
});

test("server profile load forwards the browser's cookies to the API", async (context) => {
  const user = {
    id: "6f1c1b7e-2f4a-4c55-9d7e-1b2c3d4e5f60",
    email: "a@example.com",
    name: null,
    createdAt: "2026-10-08T00:00:00.000Z",
    providers: ["google"],
  };
  context.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(url, "http://localhost:3001/api/seller");
    assert.deepEqual(options.headers, { cookie: "better-auth.session_token=abc" });
    return Response.json({ user, stores: [] });
  });
  assert.deepEqual(await loadSeller("better-auth.session_token=abc"), { user, stores: [] });
});
