import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import request from "supertest";
import { createApi } from "../../src/create-api";

process.env.SHOPIFY_API_SECRET = "test-secret";

let app: Awaited<ReturnType<typeof createApi>>;
before(async () => (app = await createApi()));
after(() => app.close());

// The signature covers the exact bytes Shopify sent, so this proves the raw body survives Nest.
test("Shopify webhooks are verified against the raw request body", async () => {
  const body = '{"shop_domain":  "x.myshopify.com" ,"note":"spacing matters"}';
  const shop = `shop-${randomUUID().slice(0, 8)}.myshopify.com`;
  const post = (hmac: string) =>
    request(app.getHttpServer())
      .post("/api/webhooks/shopify")
      .set("Content-Type", "application/json")
      .set("X-Shopify-Topic", "customers/data_request")
      .set("X-Shopify-Shop-Domain", shop)
      .set("X-Shopify-Hmac-Sha256", hmac)
      .send(body);

  const signed = createHmac("sha256", "test-secret").update(body).digest("base64");
  assert.equal((await post(signed)).status, 200);
  assert.equal(
    (await post(createHmac("sha256", "wrong").update(body).digest("base64"))).status,
    401,
  );
});
