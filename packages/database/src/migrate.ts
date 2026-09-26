import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { databaseUrl } from "@shopping-mcp/config";

async function main() {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    await migrate(drizzle(client), {
      migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), "../migrations"),
    });
  } finally {
    await client.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
