import { All, Controller, Get, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { signInChallenge, verifyMcpToken } from "./auth";
import { getAccountTool, runGetAccountTool } from "./tools/get-account";
import { compareProductsTool, runCompareProductsTool } from "./tools/compare-products";
import { getCheckoutTool, runGetCheckoutTool } from "./tools/get-checkout";
import { getProductTool, runGetProductTool } from "./tools/get-product";
import { runSearchProductsTool, searchProductsTool } from "./tools/search-products";
import { sendFetchResponse, toFetchRequest } from "../fetch-adapter";

const mcpHandler = createMcpHandler(
  (server) => {
    server.registerTool("search_products", searchProductsTool, runSearchProductsTool);
    server.registerTool("get_product", getProductTool, runGetProductTool);
    server.registerTool("compare_products", compareProductsTool, runCompareProductsTool);
    server.registerTool("get_checkout", getCheckoutTool, runGetCheckoutTool);
    server.registerTool("get_account", getAccountTool, runGetAccountTool);
  },
  { serverInfo: { name: "shopping-mcp", version: "0.1.0" } },
);

// Catalog tools stay public: a token is optional, and when present its user reaches the tools.
const authedMcpHandler = withMcpAuth(mcpHandler, (_req, token) => verifyMcpToken(token), {
  required: false,
  resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp",
});

@Controller()
export class McpController {
  @All("api/mcp")
  async mcp(@Req() req: Request, @Res() res: Response) {
    const request = await toFetchRequest(req);
    const response = (await signInChallenge(request)) ?? (await authedMcpHandler(request));
    await sendFetchResponse(res, response);
  }

  @Get("mcp.json")
  discovery(@Req() req: Request, @Res() res: Response) {
    const origin = `${req.protocol}://${req.get("host")}`;
    res.setHeader("content-type", "application/json");
    res.setHeader("content-disposition", 'attachment; filename="shopping-mcp.json"');
    res.send(
      JSON.stringify({ mcpServers: { "shopping-mcp": { url: `${origin}/api/mcp` } } }, null, 2),
    );
  }
}
