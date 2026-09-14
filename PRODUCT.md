# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: shoppers who already use an AI assistant and want to find and compare products through that assistant, not by browsing a storefront.

Secondary: store owners who connect a Shopify catalog so those assistants can discover their products. They are not the primary audience.

## Product Purpose

Shopping with Agent lets a shopper ask their assistant to search and compare products across connected stores. Success is the assistant returning real, comparable products from the catalog — not a shopper completing checkout on this site (checkout is not supported yet).

## Positioning

Shopping happens inside the assistant. The mechanism is an MCP server over a normalized product catalog synced from Shopify. A neighboring storefront or merchant admin could not truthfully claim that.

People-facing name: **Shopping with Agent**. Protocol / config / repo name: **Shopping MCP**. Keep both; do not collapse them.

## Operating Context

Next.js app + PostgreSQL + Shopify OAuth, developed on localhost (`npm run dev` → `http://127.0.0.1:3000`). Shoppers add the MCP server to an assistant (downloadable `shopping-mcp.json` pointing at `/api/mcp`). Store owners connect at `/seller`. Contact is GitHub issues.

Heading toward a public product. The current privacy copy (“local app / should not be used with real customer data”) is stale and must not be treated as product policy. Public launch still requires real auth and data isolation (not present today).

## Capabilities and Constraints

Confirmed:

- MCP tools: `search_products`, `get_product`, `compare_products`, `get_checkout` (currently returns `supported: false`).
- Shopify is the only connector. Sync is manual, full-snapshot, capped at 10,000 products per merchant.
- Seller session is a cookie after OAuth. Shopify credentials are stored encrypted.
- HTTP catalog APIs exist (`/api/products`, `/api/merchants`) for the same catalog.
- Logo asset: `public/logo.png` (cart-with-agent mark).

Undecided / not yet built:

- Public authentication and tenant isolation model.
- Checkout / purchase through the assistant.
- Connectors beyond Shopify.
- Which assistants are officially documented (Claude, ChatGPT, Cursor, etc.).

## Brand Commitments

- Use **Shopping with Agent** in UI chrome and shopper-facing copy; use **Shopping MCP** for the protocol, config filename, and developer surfaces.
- Preserve `public/logo.png` as the product mark unless the user replaces the asset.
- Incumbent paper/ink/hatch visual system is **not** binding. The user asked to replace that world; visual replacement belongs to later design work, not this file.

## Evidence on Hand

- Working MCP catalog, Shopify connect flow, seller status UI, docs, and `public/logo.png`.
- No testimonials, customers, benchmarks, press, or case studies. Future work must not fabricate them.

## Product Principles

1. Shopper-in-assistant first — this site exists to get an assistant shopping, not to be a storefront.
2. Name the mechanism honestly — MCP config is a download/setup, not a fake “connected” state.
3. Merchants feed the catalog; they are not the hero of shopper surfaces.
4. Public-intent: treat auth, privacy, and data isolation as product requirements, not localhost disclaimers.
5. Do not invent proof, customers, or checkout capability the product does not have.
