import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApi } from "../src/create-api";

test("GET /api/seller without a session cookie is signed out with no stores", async () => {
  const app = await createApi();
  try {
    const response = await request(app.getHttpServer()).get("/api/seller");
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { user: null, stores: [] });
  } finally {
    await app.close();
  }
});

test("GET /api/products rejects invalid search parameters with 400", async () => {
  const app = await createApi();
  try {
    const response = await request(app.getHttpServer()).get("/api/products?limit=0");
    assert.equal(response.status, 400);
    assert.equal(response.body.error, "Invalid search parameters");
  } finally {
    await app.close();
  }
});

test("credentialed requests from WEB_ORIGIN receive CORS allow headers", async () => {
  process.env.WEB_ORIGIN = "http://127.0.0.1:3000";
  const app = await createApi();
  try {
    const response = await request(app.getHttpServer())
      .get("/health")
      .set("Origin", "http://127.0.0.1:3000");
    assert.equal(response.status, 200);
    assert.equal(response.headers["access-control-allow-origin"], "http://127.0.0.1:3000");
    assert.equal(response.headers["access-control-allow-credentials"], "true");
  } finally {
    await app.close();
  }
});
