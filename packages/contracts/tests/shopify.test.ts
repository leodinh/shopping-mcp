import test from "node:test";
import assert from "node:assert/strict";
import {
  connectFailureMessage,
  connectFailureMessages,
  connectFailureSchema,
} from "@shopping-mcp/contracts";

test("every connect failure has a message that says it failed", () => {
  for (const reason of connectFailureSchema.options) {
    assert.match(connectFailureMessages[reason], /^Connect failed: /, reason);
  }
});

test("a connect_error from the URL shows its message; anything else reads as a generic failure", () => {
  assert.equal(connectFailureMessage("shop_taken"), connectFailureMessages.shop_taken);
  for (const junk of ["<script>", "", undefined, ["shop_taken"]]) {
    assert.equal(connectFailureMessage(junk), connectFailureMessages.unavailable);
  }
});
