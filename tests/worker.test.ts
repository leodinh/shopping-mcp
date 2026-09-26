import test from "node:test";
import assert from "node:assert/strict";
import { OutboxProcessor } from "@shopping-mcp/worker";

test("outbox processor drains immediately and again after the interval", async () => {
  const calls: number[] = [];
  const processor = new OutboxProcessor({
    drain: async () => {
      calls.push(Date.now());
      return [];
    },
    intervalMs: 20,
  });
  processor.start();
  await new Promise((resolve) => setTimeout(resolve, 50));
  processor.stop();
  assert.ok(calls.length >= 2, `expected at least two drains, got ${calls.length}`);
});
