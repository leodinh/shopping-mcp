import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestDatabase } from "@shopping-mcp/database/testing";

// Plain `timestamp` silently depends on the session time zone; regenerating the Better Auth
// schema reintroduces it, so guard every table after all migrations.
test("every timestamp column stores a time zone", async () => {
  const { pool, drop } = await createTestDatabase("timestamps");
  try {
    const { rows } = await pool.query<{ column: string }>(`
      SELECT table_name || '.' || column_name AS column
      FROM information_schema.columns
      WHERE table_schema = current_schema() AND data_type = 'timestamp without time zone'
      ORDER BY 1
    `);
    assert.deepEqual(
      rows.map((row) => row.column),
      [],
    );
  } finally {
    await drop();
  }
});
