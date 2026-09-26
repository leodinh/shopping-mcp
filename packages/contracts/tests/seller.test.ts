import test from "node:test";
import assert from "node:assert/strict";
import { sellerResponseSchema } from "@shopping-mcp/contracts";

test("seller responses use ISO timestamps on the wire", () => {
  const merchant = {
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
  assert.deepEqual(sellerResponseSchema.parse({ merchant }), { merchant });
  assert.equal(
    sellerResponseSchema.safeParse({ merchant: { ...merchant, lastSyncedAt: new Date() } }).success,
    false,
  );
  assert.equal(
    sellerResponseSchema.safeParse({ merchant: { ...merchant, lastSyncedAt: "not-a-date" } })
      .success,
    false,
  );
  assert.deepEqual(sellerResponseSchema.parse({ merchant: null }), { merchant: null });
});
