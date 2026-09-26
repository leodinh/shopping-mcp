import test from "node:test";
import assert from "node:assert/strict";
import { apiUrl } from "../src/lib/api/origin";

test("seller and MCP clients target the Nest API origin", () => {
  const previous = process.env.NEXT_PUBLIC_API_ORIGIN;
  process.env.NEXT_PUBLIC_API_ORIGIN = "http://127.0.0.1:3001";
  try {
    assert.equal(apiUrl("/api/seller"), "http://127.0.0.1:3001/api/seller");
    assert.equal(apiUrl("/mcp.json"), "http://127.0.0.1:3001/mcp.json");
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_API_ORIGIN;
    else process.env.NEXT_PUBLIC_API_ORIGIN = previous;
  }
});
