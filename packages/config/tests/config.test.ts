import test from "node:test";
import assert from "node:assert/strict";
import { sellerDashboardUrl, webOrigin } from "@shopping-mcp/config";

test("seller dashboard URL uses WEB_ORIGIN so OAuth bounce leaves the API host", () => {
  const previous = process.env.WEB_ORIGIN;
  process.env.WEB_ORIGIN = "http://127.0.0.1:3000";
  try {
    assert.equal(webOrigin(), "http://127.0.0.1:3000");
    assert.equal(sellerDashboardUrl(), "http://127.0.0.1:3000/seller");
  } finally {
    if (previous === undefined) delete process.env.WEB_ORIGIN;
    else process.env.WEB_ORIGIN = previous;
  }
});
