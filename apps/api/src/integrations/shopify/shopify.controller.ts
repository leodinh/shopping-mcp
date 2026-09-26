import { All, Controller, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { handleShopifyCallback, handleShopifyConnect } from "@shopping-mcp/application";
import { sendFetchResponse, toFetchRequest } from "../../fetch-adapter";

@Controller()
export class ShopifyController {
  @Post("api/shopify/connect")
  async connect(@Req() req: Request, @Res() res: Response) {
    const response = await handleShopifyConnect(await toFetchRequest(req));
    await sendFetchResponse(res, response);
  }

  @All("api/connections/shopify/callback")
  async callback(@Req() req: Request, @Res() res: Response) {
    const response = await handleShopifyCallback(await toFetchRequest(req));
    await sendFetchResponse(res, response);
  }
}
