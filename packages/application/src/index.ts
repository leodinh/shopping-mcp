export { searchProducts, getProductById, compareProducts, getCheckout } from "./catalog/repository";
export { listMerchants, getDashboardMerchant } from "./merchants/repository";
export { ensureMerchantForShop } from "./merchants/service";
export {
  SESSION_COOKIE_MAX_AGE,
  signSessionCookie,
  readSessionCookie,
  createSession,
  clearSessionCookie,
  destroySession,
  requireSession,
} from "./auth/session";
export { syncConnection } from "./sync/service";
export { enqueueSync, drainSyncRuns } from "./sync/outbox";
export { normalizeShopDomain, shopifyAuthorizeUrl, startShopifyConnect, handleShopifyConnect } from "./shopify/connect";
export { handleShopifyCallback } from "./shopify/callback";
export { verifyShopifyHmac } from "./shopify/hmac";
export { encryptCredentials, decryptCredentials, type ShopifyCredentials } from "./shopify/credentials";
export { getConnector } from "./connectors/registry";
export { mapShopifyProduct, fetchShopifyCatalog, shopifyConnector, type ShopifyFetchOptions } from "./connectors/shopify";
export { searchProductsInput, toCatalogSearch, searchProductsTool, runSearchProductsTool } from "./mcp/search-products";
export { getProductInput, getProductTool, runGetProductTool } from "./mcp/get-product";
export { compareProductsInput, compareProductsTool, runCompareProductsTool } from "./mcp/compare-products";
export { getCheckoutInput, getCheckoutTool, runGetCheckoutTool } from "./mcp/get-checkout";
export { textResult, dataResult, catalogToolError } from "./mcp/responses";
