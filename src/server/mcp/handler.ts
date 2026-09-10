import { createMcpHandler } from "mcp-handler";
import { ZodError } from "zod";
import { searchProducts } from "@/server/catalog/repository";
import { searchProductsInput, toCatalogSearch } from "@/server/mcp/search-products";

export const mcpHandler = createMcpHandler(
  (server) => {
    server.registerTool(
      "search_products",
      {
        title: "Search Products",
        description:
          "Search active products across connected merchants. Returns prices, availability, and merchant details.",
        inputSchema: searchProductsInput,
      },
      async (input) => {
        try {
          const result = await searchProducts(toCatalogSearch(input));
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        } catch (error) {
          if (error instanceof ZodError) {
            return {
              isError: true,
              content: [{ type: "text", text: JSON.stringify({ error: "Invalid search parameters", issues: error.issues }) }],
            };
          }
          console.error("Catalog search failed", error);
          return { isError: true, content: [{ type: "text", text: "Catalog unavailable. Check database setup." }] };
        }
      },
    );
  },
  { serverInfo: { name: "shopping-mcp", version: "0.1.0" } },
);
