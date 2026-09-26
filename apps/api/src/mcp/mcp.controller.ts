import { All, Controller, Get, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { createMcpHandler } from "mcp-handler";
import {
  compareProductsTool,
  getCheckoutTool,
  getProductTool,
  runCompareProductsTool,
  runGetCheckoutTool,
  runGetProductTool,
  runSearchProductsTool,
  searchProductsTool,
} from "@shopping-mcp/application";
import { sendFetchResponse, toFetchRequest } from "../fetch-adapter";

const mcpHandler = createMcpHandler(
  (server) => {
    server.registerTool("search_products", searchProductsTool, runSearchProductsTool);
    server.registerTool("get_product", getProductTool, runGetProductTool);
    server.registerTool("compare_products", compareProductsTool, runCompareProductsTool);
    server.registerTool("get_checkout", getCheckoutTool, runGetCheckoutTool);
  },
  { serverInfo: { name: "shopping-mcp", version: "0.1.0" } },
);

@Controller()
export class McpController {
  @All("api/mcp")
  async mcp(@Req() req: Request, @Res() res: Response) {
    const response = await mcpHandler(await toFetchRequest(req));
    await sendFetchResponse(res, response);
  }

  @Get("mcp.json")
  discovery(@Req() req: Request, @Res() res: Response) {
    const origin = `${req.protocol}://${req.get("host")}`;
    res.setHeader("content-type", "application/json");
    res.setHeader("content-disposition", 'attachment; filename="shopping-mcp.json"');
    res.send(JSON.stringify({ mcpServers: { "shopping-mcp": { url: `${origin}/api/mcp` } } }, null, 2));
  }
}
