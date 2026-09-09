import { createServer } from "node:http";
import { demoCatalog } from "@/server/demo/catalog";

const port = Number(process.env.DEMO_API_PORT ?? 4001);
const server = createServer((request, response) => {
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  const match = /^\/stores\/([a-z0-9-]+)\/products$/.exec(path);
  const catalog = match ? demoCatalog(match[1]) : null;
  response.setHeader("Content-Type", "application/json");
  if (request.method !== "GET") {
    response.writeHead(405, { Allow: "GET" });
    response.end(JSON.stringify({ error: "Method not allowed" }));
  } else {
    response.writeHead(catalog ? 200 : 404);
    response.end(JSON.stringify(catalog ?? { error: "Store not found" }));
  }
});
server.listen(port, "127.0.0.1", () => console.log(`Demo merchant API: http://127.0.0.1:${port}`));
for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => server.close());
