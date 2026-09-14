import test from "node:test";
import assert from "node:assert/strict";
import { authorizeCron } from "@/server/sync/cron-auth";

test("cron auth rejects missing bearer secret", () => {
  process.env.CRON_SECRET = "test-cron-secret";
  assert.equal(
    authorizeCron(new Request("http://127.0.0.1:3000/api/cron/sync", { method: "POST" })),
    false,
  );
  assert.equal(
    authorizeCron(
      new Request("http://127.0.0.1:3000/api/cron/sync", {
        method: "POST",
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    ),
    true,
  );
});
