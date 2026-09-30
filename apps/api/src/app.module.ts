import { Module } from "@nestjs/common";
import { AuthController } from "./auth/auth.controller";
import { CatalogController } from "./catalog/catalog.controller";
import { HealthController } from "./health/health.controller";
import { ShopifyController } from "./shopify/shopify.controller";
import { McpController } from "./mcp/mcp.controller";
import { MerchantsController } from "./merchants/merchants.controller";
import { WebhooksController } from "./webhooks/webhooks.controller";

@Module({
  controllers: [
    HealthController,
    CatalogController,
    MerchantsController,
    AuthController,
    ShopifyController,
    McpController,
    WebhooksController,
  ],
})
export class AppModule {}
