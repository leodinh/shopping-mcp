import test from "node:test";
import assert from "node:assert/strict";
import type { StoreConnectionFailure } from "@shopping-mcp/commerce/store-connection";
import { storeConnectionFailure } from "../src/shopify/connect";

test("each Store connection failure maps to an HTTP status the seller UI can show", async () => {
  const expected = {
    invalid_shop: 400,
    invalid_hmac: 403,
    invalid_state: 403,
    shop_taken: 409,
    shop_mismatch: 409,
    token_exchange_failed: 502,
  } satisfies Record<StoreConnectionFailure, number>;
  for (const [reason, status] of Object.entries(expected)) {
    const response = storeConnectionFailure(reason as StoreConnectionFailure);
    assert.equal(response.status, status, reason);
    const body = (await response.json()) as { error: unknown };
    assert.equal(typeof body.error, "string", reason);
  }
});
