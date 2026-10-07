import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from "jose";
import request from "supertest";
import { database, merchants, pool, user } from "@shopping-mcp/database";
import { createApi } from "../../src/create-api";

// The API verifies tokens against `${API_ORIGIN}/api/auth/jwks`; serve test keys from there.
let jwksServer: Server;
let origin: string;
let signingKey: CryptoKey;
let app: Awaited<ReturnType<typeof createApi>>;
const alice = { id: randomUUID(), email: `alice-${randomUUID()}@example.test`, name: "Alice" };
const bob = { id: randomUUID(), email: `bob-${randomUUID()}@example.test`, name: "Bob" };
const aliceStore = randomUUID();
const bobStore = randomUUID();

before(async () => {
  const pair = await generateKeyPair("EdDSA", { crv: "Ed25519" });
  signingKey = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "test", alg: "EdDSA" };
  jwksServer = createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) => jwksServer.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(jwksServer.address() as AddressInfo).port}`;
  process.env.API_ORIGIN = origin;
  process.env.AUTH_JWKS_URL = `${origin}/api/auth/jwks`;
  await database().insert(user).values([alice, bob]);
  await database()
    .insert(merchants)
    .values([
      {
        id: aliceStore,
        slug: `alice-${aliceStore}.myshopify.com`,
        name: "Alice's",
        websiteUrl: "https://alice.example",
        userId: alice.id,
      },
      {
        id: bobStore,
        slug: `bob-${bobStore}.myshopify.com`,
        name: "Bob's",
        websiteUrl: "https://bob.example",
        userId: bob.id,
      },
    ]);
  app = await createApi();
});

after(async () => {
  await app.close();
  await pool().query("DELETE FROM merchants WHERE id = ANY($1)", [[aliceStore, bobStore]]);
  await pool().query('DELETE FROM "user" WHERE id = ANY($1)', [[alice.id, bob.id]]);
  jwksServer.close();
});

function token(
  sub: string,
  overrides: { audience?: string; issuer?: string; expiresIn?: string; key?: CryptoKey } = {},
) {
  return new SignJWT({ scope: "openid account", azp: "test-client" })
    .setProtectedHeader({ alg: "EdDSA", kid: "test" })
    .setSubject(sub)
    .setIssuer(overrides.issuer ?? `${origin}/api/auth`)
    .setAudience(overrides.audience ?? `${origin}/api/mcp`)
    .setIssuedAt()
    .setExpirationTime(overrides.expiresIn ?? "5m")
    .sign(overrides.key ?? signingKey);
}

function rpc(method: string, params: Record<string, unknown>, bearer?: string) {
  const call = request(app.getHttpServer())
    .post("/api/mcp")
    .set("Accept", "application/json, text/event-stream")
    .send({ jsonrpc: "2.0", id: 1, method, params });
  return bearer ? call.set("Authorization", `Bearer ${bearer}`) : call;
}

function result(response: { text: string }) {
  const sse = response.text.match(/^data: (.+)$/m);
  return JSON.parse(sse ? sse[1] : response.text).result;
}

const getAccount = (bearer?: string, args: Record<string, unknown> = {}) =>
  rpc("tools/call", { name: "get_account", arguments: args }, bearer);

test("public tools need no sign-in; get_account is advertised as OAuth-protected", async () => {
  const listed = await rpc("tools/list", {});
  assert.equal(listed.status, 200);
  const tools = result(listed).tools as Array<{ name: string; _meta?: Record<string, unknown> }>;
  const account = tools.find((tool) => tool.name === "get_account");
  assert.deepEqual(account?._meta?.securitySchemes, [{ type: "oauth2", scopes: ["account"] }]);

  const search = await rpc("tools/call", { name: "search_products", arguments: { q: "mug" } });
  assert.equal(search.status, 200);
  assert.notEqual(result(search).isError, true);
});

test("calling get_account signed out answers 401 with a challenge that starts sign-in", async () => {
  const response = await getAccount();
  assert.equal(response.status, 401);
  const challenge = response.headers["www-authenticate"];
  assert.match(
    challenge,
    new RegExp(`resource_metadata="${origin}/.well-known/oauth-protected-resource/api/mcp"`),
  );
  assert.match(challenge, /scope="account"/);
});

test("a valid token identifies the user and their stores; a userId in the arguments is ignored", async () => {
  const response = await getAccount(await token(alice.id), { userId: bob.id });
  assert.equal(response.status, 200);
  assert.deepEqual(result(response).structuredContent.account, {
    userId: alice.id,
    email: alice.email,
    name: alice.name,
  });
  const stores = result(response).structuredContent.stores as Array<{ id: string; name: string }>;
  assert.deepEqual(
    stores.map((store) => store.id),
    [aliceStore],
    "only the token's user's stores, never Bob's",
  );
  assert.deepEqual(result(response).structuredContent.connection, {
    clientId: "test-client",
    scopes: ["openid", "account"],
  });
});

test("tokens for another audience, another issuer, expired, or forged are rejected", async () => {
  const forger = (await generateKeyPair("EdDSA", { crv: "Ed25519" })).privateKey;
  for (const bad of [
    await token(alice.id, { audience: "https://other.example/api/mcp" }),
    await token(alice.id, { issuer: "https://evil.example/api/auth" }),
    await token(alice.id, { expiresIn: "-1m" }),
    await token(alice.id, { key: forger }),
    "not-a-jwt",
  ]) {
    const response = await getAccount(bad);
    assert.equal(response.status, 401);
    assert.match(response.headers["www-authenticate"], /error="invalid_token"/);
  }
});
