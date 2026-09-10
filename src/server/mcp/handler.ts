import { createMcpHandler } from "mcp-handler";
import { runCompareProductsTool, compareProductsTool } from "@/server/mcp/compare-products";
import { runGetCheckoutTool, getCheckoutTool } from "@/server/mcp/get-checkout";
import { runGetProductTool, getProductTool } from "@/server/mcp/get-product";
import { runSearchProductsTool, searchProductsTool } from "@/server/mcp/search-products";

export const mcpHandler = createMcpHandler(
  (server) => {
    server.registerTool("search_products", searchProductsTool, runSearchProductsTool);
    server.registerTool("get_product", getProductTool, runGetProductTool);
    server.registerTool("compare_products", compareProductsTool, runCompareProductsTool);
    server.registerTool("get_checkout", getCheckoutTool, runGetCheckoutTool);
  },
  { serverInfo: { name: "shopping-mcp", version: "0.1.0" } },
);
