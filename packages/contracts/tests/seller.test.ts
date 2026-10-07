import test from "node:test";
import assert from "node:assert/strict";
import { sellerResponseSchema } from "@shopping-mcp/contracts";

const store = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "test.myshopify.com",
  name: "Test",
  connectionId: null,
  connectorType: null,
  enabled: null,
  lastSyncedAt: "2026-09-13T18:00:00.000Z",
  lastError: null,
  productCount: 0,
};
const user = { id: "00000000-0000-4000-8000-000000000002", email: "alice@example.test" };

test("seller responses carry the signed-in user and their stores, with ISO timestamps", () => {
  assert.deepEqual(sellerResponseSchema.parse({ user, stores: [store] }), {
    user,
    stores: [store],
  });
  assert.deepEqual(sellerResponseSchema.parse({ user: null, stores: [] }), {
    user: null,
    stores: [],
  });
  for (const lastSyncedAt of [new Date(), "not-a-date"]) {
    const response = { user, stores: [{ ...store, lastSyncedAt }] };
    assert.equal(sellerResponseSchema.safeParse(response).success, false);
  }
});
