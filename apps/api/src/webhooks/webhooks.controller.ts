import { Controller, Post, Req, Res, type RawBodyRequest } from "@nestjs/common";
import type { Request, Response } from "express";
import { handleShopifyWebhook } from "@shopping-mcp/commerce/store-connection";

@Controller("api/webhooks")
export class WebhooksController {
  @Post("shopify")
  async shopify(@Req() req: RawBodyRequest<Request>, @Res() res: Response) {
    try {
      const result = await handleShopifyWebhook({
        topic: req.get("x-shopify-topic") ?? null,
        shop: req.get("x-shopify-shop-domain") ?? null,
        hmac: req.get("x-shopify-hmac-sha256") ?? null,
        body: req.rawBody ?? Buffer.alloc(0),
      });
      res.status(result.ok ? 200 : 401).end();
    } catch (error) {
      // 5xx makes Shopify retry the delivery.
      console.error("Shopify webhook failed", error);
      res.status(503).end();
    }
  }
}
