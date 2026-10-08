import test from "node:test";
import assert from "node:assert/strict";
import { profileUrl, webOrigin } from "@shopping-mcp/config";

test("profile URL uses WEB_ORIGIN so OAuth bounce leaves the API host", () => {
  const previous = process.env.WEB_ORIGIN;
  process.env.WEB_ORIGIN = "http://127.0.0.1:3000";
  try {
    assert.equal(webOrigin(), "http://127.0.0.1:3000");
    assert.equal(profileUrl(), "http://127.0.0.1:3000/profile");
  } finally {
    if (previous === undefined) delete process.env.WEB_ORIGIN;
    else process.env.WEB_ORIGIN = previous;
  }
});
