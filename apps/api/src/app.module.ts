import { Module, type OnApplicationShutdown, type OnModuleInit } from "@nestjs/common";
import { closeProductSearch, connectSearchCache } from "@shopping-mcp/commerce/catalog";
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
export class AppModule implements OnModuleInit, OnApplicationShutdown {
  // Connect while the API starts: a connection opened by the first search isn't ready in time
  // for it, so that search would skip the cache.
  onModuleInit() {
    connectSearchCache();
  }

  // The search cache's Redis connection would otherwise keep the process alive after shutdown.
  onApplicationShutdown() {
    return closeProductSearch();
  }
}
