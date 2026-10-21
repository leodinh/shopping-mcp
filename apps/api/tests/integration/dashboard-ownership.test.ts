import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { webOrigin } from "@shopping-mcp/config";
import { sellerResponseSchema } from "@shopping-mcp/contracts";
import { database, merchantConnections, merchants, pool } from "@shopping-mcp/database";
import { createApi } from "../../src/create-api";

// Never send real email from tests (and spend the quota): links go to the console instead.
delete process.env.RESEND_API_KEY;

let app: Awaited<ReturnType<typeof createApi>>;
const emails = {
  alice: `alice-${randomUUID()}@example.test`,
  bob: `bob-${randomUUID()}@example.test`,
};
const createdStores: string[] = [];

before(async () => (app = await createApi()));
after(async () => {
  await app.close();
  await pool().query("DELETE FROM merchants WHERE id = ANY($1)", [createdStores]);
  await pool().query('DELETE FROM "user" WHERE email = ANY($1)', [Object.values(emails)]);
});

/** Signs in the way a person does: request a magic link, open it, keep the session cookie. */
async function signIn(email: string) {
  const logged: string[] = [];
  const log = console.log;
  console.log = (...args: unknown[]) => void logged.push(args.join(" "));
  try {
    const sent = await request(app.getHttpServer())
      .post("/api/auth/sign-in/magic-link")
      .set("Origin", webOrigin())
      .send({ email, callbackURL: `${webOrigin()}/profile` });
    assert.equal(sent.status, 200, sent.text);
  } finally {
    console.log = log;
  }
  const link = logged.map((line) => /Magic link for \S+: (\S+)/.exec(line)?.[1]).find(Boolean);
  assert.ok(link, "magic link was not sent");
  const { pathname, search } = new URL(link);
  const opened = await request(app.getHttpServer()).get(pathname + search);
  const cookies = ([] as string[]).concat(opened.headers["set-cookie"] ?? []);
  assert.ok(cookies.some((cookie) => cookie.startsWith("better-auth.session_token=")));
  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

/** The dashboard for a session cookie; null when the API refuses it (401). */
async function me(cookie: string) {
  const response = await request(app.getHttpServer()).get("/api/seller").set("Cookie", cookie);
  if (response.status === 401) return null;
  assert.equal(response.status, 200, response.text);
  return sellerResponseSchema.parse(response.body);
}

async function storeFor(userId: string) {
  const id = randomUUID();
  const shop = `shop-${id.slice(0, 8)}.myshopify.com`;
  await database()
    .insert(merchants)
    .values({ id, slug: shop, name: shop, websiteUrl: `https://${shop}`, userId });
  await database()
    .insert(merchantConnections)
    .values({ merchantId: id, connectorType: "shopify", config: { shop }, shopDomain: shop });
  createdStores.push(id);
  return id;
}

const post = (path: string, cookie?: string) => {
  const call = request(app.getHttpServer()).post(path);
  return cookie ? call.set("Cookie", cookie) : call;
};

async function enabled(merchantId: string) {
  const { rows } = await pool().query<{ enabled: boolean }>(
    "SELECT enabled FROM merchant_connections WHERE merchant_id = $1",
    [merchantId],
  );
  return rows[0].enabled;
}

test("each signed-in User sees only their own stores and can act only on them", async () => {
  const alice = await signIn(emails.alice);
  const bob = await signIn(emails.bob);
  const aliceId = (await me(alice))!.user.id;
  const bobId = (await me(bob))!.user.id;
  assert.notEqual(aliceId, bobId);
  const aliceStore = await storeFor(aliceId);
  const bobStore = await storeFor(bobId);

  assert.deepEqual(
    (await me(alice))!.stores.map((store) => store.id),
    [aliceStore],
  );
  assert.deepEqual(
    (await me(bob))!.stores.map((store) => store.id),
    [bobStore],
  );

  // Bob cannot touch Alice's store: it looks like it doesn't exist.
  assert.equal((await post(`/api/seller/stores/${aliceStore}/disconnect`, bob)).status, 404);
  assert.equal(await enabled(aliceStore), true);

  // Alice can.
  assert.equal((await post(`/api/seller/stores/${aliceStore}/disconnect`, alice)).status, 200);
  assert.equal(await enabled(aliceStore), false);
  assert.equal(await enabled(bobStore), true);
});

test("signed out or with a forged cookie, the dashboard and every store action are refused", async () => {
  assert.equal(await me(""), null);
  const someone = randomUUID();
  assert.equal((await post(`/api/seller/stores/${someone}/disconnect`)).status, 401);
  const forged = "better-auth.session_token=forged.signature";
  assert.equal(await me(forged), null);
  assert.equal((await post(`/api/seller/stores/${someone}/disconnect`, forged)).status, 401);
});

test("signing out ends the session", async () => {
  const session = await signIn(emails.alice);
  assert.ok(await me(session));
  const out = await request(app.getHttpServer())
    .post("/api/auth/sign-out")
    .set("Origin", webOrigin())
    .set("Cookie", session)
    .send({});
  assert.equal(out.status, 200, out.text);
  assert.equal(await me(session), null);
});

test("the dashboard returns the signed-in User's profile in the shared contract", async () => {
  const { user } = (await me(await signIn(emails.alice)))!;
  assert.equal(user.email, emails.alice);
  assert.ok(!Number.isNaN(Date.parse(user.createdAt)));
  // Signed in by email link only: no linked provider such as google.
  assert.ok(!user.providers.includes("google"));
});
