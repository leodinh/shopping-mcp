import test from "node:test";
import assert from "node:assert/strict";
import { sellerResponseSchema } from "@shopping-mcp/contracts";

const store = {
  id: "00000000-0000-4000-8000-000000000001",
  status: "disconnected",
  slug: "test.myshopify.com",
  name: "Test",
  connectionId: null,
  connectorType: null,
  enabled: null,
  lastError: null,
};
const user = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "alice@example.test",
  name: null,
  createdAt: "2026-09-01T09:00:00.000Z",
  providers: ["google"],
};

test("seller responses carry the signed-in user and their stores, with ISO timestamps", () => {
  assert.deepEqual(sellerResponseSchema.parse({ user, stores: [store] }), {
    user,
    stores: [store],
  });
  // Signed out is a 401 from the API, never a response without a user.
  assert.equal(sellerResponseSchema.safeParse({ user: null, stores: [] }).success, false);
  for (const createdAt of [new Date(), "not-a-date"]) {
    const response = { user: { ...user, createdAt }, stores: [store] };
    assert.equal(sellerResponseSchema.safeParse(response).success, false);
  }
  const unknownStatus = { user, stores: [{ ...store, status: "awaiting sync" }] };
  assert.equal(sellerResponseSchema.safeParse(unknownStatus).success, false);
});
