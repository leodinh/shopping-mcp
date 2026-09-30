import test from "node:test";
import assert from "node:assert/strict";
import { OutboxProcessor } from "../src/processors/outbox.processor";

test("each tick queues due syncs, then drains; immediately and again after the interval", async () => {
  const calls: string[] = [];
  const processor = new OutboxProcessor({
    enqueueDue: async () => (calls.push("due"), 0),
    drain: async () => (calls.push("drain"), []),
    intervalMs: 20,
  });
  processor.start();
  await new Promise((resolve) => setTimeout(resolve, 50));
  processor.stop();
  assert.ok(calls.length >= 4, `expected at least two ticks, got ${calls.join(",")}`);
  assert.deepEqual(calls.slice(0, 4), ["due", "drain", "due", "drain"]);
});
