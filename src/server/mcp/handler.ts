import { createMcpHandler } from "mcp-handler";
import { runSearchProductsTool, searchProductsTool } from "@/server/mcp/search-products";

export const mcpHandler = createMcpHandler(
  (server) => {
    server.registerTool("search_products", searchProductsTool, runSearchProductsTool);
  },
  { serverInfo: { name: "shopping-mcp", version: "0.1.0" } },
);
