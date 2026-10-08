import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { apiOrigin, webOrigin } from "@shopping-mcp/config";
import { createApi } from "../../src/create-api";

// Fake credentials: the test only checks where the browser is sent, never calls Google.
process.env.GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "test-secret";

let app: Awaited<ReturnType<typeof createApi>>;
before(async () => (app = await createApi()));
after(() => app.close());

test("Continue with Google sends the browser to Google's account picker with our callback", async () => {
  const response = await request(app.getHttpServer())
    .post("/api/auth/sign-in/social")
    .set("Origin", webOrigin())
    .send({ provider: "google", callbackURL: `${webOrigin()}/profile` });
  assert.equal(response.status, 200, response.text);

  const url = new URL(response.body.url);
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("client_id"), "test-client.apps.googleusercontent.com");
  assert.equal(url.searchParams.get("redirect_uri"), `${apiOrigin()}/api/auth/callback/google`);
  assert.equal(url.searchParams.get("prompt"), "select_account");
  assert.match(url.searchParams.get("scope") ?? "", /email/);
  assert.ok(url.searchParams.get("state"), "state protects the callback");
  assert.ok(url.searchParams.get("code_challenge"), "PKCE");
});
