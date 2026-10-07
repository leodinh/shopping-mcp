import test from "node:test";
import assert from "node:assert/strict";
import { describeClient } from "../src/features/account/client-identity";

test("a CIMD client is verified by the host its metadata document came from", () => {
  assert.deepEqual(
    describeClient({
      client_id: "https://chatgpt.com/oauth/client.json",
      client_name: "ChatGPT",
      logo_uri: "https://persistent.oaistatic.com/logo.png",
    }),
    {
      name: "ChatGPT",
      logoUrl: "https://persistent.oaistatic.com/logo.png",
      verifiedHost: "chatgpt.com",
    },
  );
});

test("a dynamically registered client is unverified, whatever name it claims", () => {
  const client = describeClient({ client_id: "aBcDeF123", client_name: "ChatGPT" });
  assert.equal(client.verifiedHost, null);
  assert.equal(client.name, "ChatGPT");
});

test("unsafe or missing metadata degrades safely", () => {
  assert.deepEqual(
    describeClient({ client_id: "abc", client_name: "  ", logo_uri: "javascript:alert(1)" }),
    { name: "abc", logoUrl: null, verifiedHost: null },
  );
  assert.equal(
    describeClient({ client_id: "abc", logo_uri: "http://evil.example/x.png" }).logoUrl,
    null,
  );
  assert.equal(describeClient({ client_id: "http://insecure.example/c.json" }).verifiedHost, null);
});
