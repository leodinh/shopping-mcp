# Shopping MCP

### Seller UI

The home page now shows only **Connect Your Store**, followed by that selected store's connection state, product count, sync status, last synced time, and sync/retry button. It does not display product listings, search controls, other merchants' status, or API links. Cross-merchant search remains available through the API below.

After Shopify OAuth, a session cookie identifies the connected merchant for the seller dashboard. Do not deploy this app publicly without reviewing auth and data isolation.

## Local setup

Prerequisites: Node.js 22+, npm, and PostgreSQL 17+.

From this directory:

```sh
npm ci
cp .env.example .env
npm run dev
```

Leave that terminal running. It starts Next.js at http://127.0.0.1:3000. In a second terminal, from this same directory:

```sh
npm run db:migrate
```

Open http://127.0.0.1:3000/seller and connect a Shopify store. The seller page shows that store's connection state, product count, and sync status.

Create an empty `shopping-mcp` database and set `DATABASE_URL` in `.env`. Include the PostgreSQL user (`postgresql://USER@localhost:5432/shopping-mcp`). Add `:PASSWORD` after the user only when the server requires one. Localhost credentials are for development only.

## Commands

### Code quality

- `npm run lint`: check Next.js, React, and TypeScript rules with ESLint.
- `npm run lint:fix`: apply available ESLint fixes.
- `npm run format`: format supported files with Prettier.
- `npm run format:check`: check formatting without changing files.

ESLint checks code quality; Prettier handles formatting. `eslint-config-prettier` disables conflicting stylistic lint rules. Generated output, environment files, and generated agent instructions are excluded from formatting.

| Command                     | Purpose                                                        |
| --------------------------- | -------------------------------------------------------------- |
| `npm run dev`              | Next.js at http://127.0.0.1:3000                               |
| `npm run db:migrate`       | Apply outstanding SQL migrations transactionally               |
| `npm run db:setup`         | Same as `db:migrate`                                           |
| `npm run sync`             | Import all enabled merchant connections                        |
| `npm run sync -- <slug>`   | Import one merchant                                            |
| `npm test`                 | Contract and input validation tests; no database               |
| `npm run test:integration` | Real PostgreSQL lifecycle tests; migrate first                 |
| `npm run typecheck`        | TypeScript validation                                          |
| `npm run build`            | Production Next.js build                                       |
| `npm start`                | Serve production build                                         |

Integration tests create uniquely named test merchants and remove only their own records. Never run local tooling against a production database. Repeating sync does not duplicate products.

## HTTP API

```sh
curl 'http://127.0.0.1:3000/api/products?q=black+backpack&maxPrice=100'
curl 'http://127.0.0.1:3000/api/products?inStock=true&limit=5&offset=0'
curl 'http://127.0.0.1:3000/api/merchants'
```

The MCP endpoint is `http://127.0.0.1:3000/api/mcp`. Tools call catalog functions; they do not query SQL directly.

| Tool               | Backend             | Purpose                                                                                                |
| ------------------ | ------------------- | ------------------------------------------------------------------------------------------------------ |
| `search_products`  | `searchProducts()`  | Find products using keywords, price, merchant, and availability                                        |
| `get_product`      | `getProductById()`  | Retrieve one product by its internal ID                                                                |
| `compare_products` | `compareProducts()` | Retrieve consistent details for 2–5 products so an assistant can explain differences                   |
| `get_checkout`     | `getCheckout()`     | Look up a merchant checkout URL; currently returns `supported: false` |

`GET /api/products` accepts `q` (up to 200 characters), optional `merchantId` (UUID), `currency` (uppercase, default USD), `maxPrice` (major units, non-negative, up to 2 decimals), `inStock` (`true`/`false`), `limit` (1–100, default 24), and `offset` (0–100000). Returns `{ products, total, limit, offset }`. Each product includes its merchant, stable internal ID, external ID, name, description, `priceMinor`, currency, images, inventory, product URL, and update time. Invalid filters return 400; database unavailability returns 503 without database details. Parameters use prepared SQL, not string interpolation.

The API supports currency filtering, not currency conversion. This milestone assumes currencies with two decimal minor units. Connect a Shopify store from `/seller`. Keep the app bound to localhost unless you add real auth.

## Architecture

```text
Next.js page / read-only API / MCP ──> catalog + merchants ──> PostgreSQL
                                                              ↑
sync CLI ──> sync service ──> connector interface ──> Shopify
                 └──────── normalized snapshot ─────────┘
```

This is a **modular monolith**, not a distributed commerce backend. Application modules live in one Next.js project and share one database.

- `src/server/catalog`: `product.entity.ts`, validated search, PostgreSQL full-text search and pagination.
- `src/server/merchants`: `merchant.entity.ts`, `merchant-connection.entity.ts`, and the `MerchantStatus` read model.
- `src/server/connectors`: normalized product contract, validation, and registry.
- `src/server/sync`: imports and snapshot reconciliation; no framework dependency.
- `src/server/db/client.ts`: pooled database access shared across development reloads.
- `src/server/mcp`: MCP handler and tool adapters. Each tool maps agent input onto a catalog function.
- `src/app`: seller status page, private `_components` and `_actions` folders, and read-only HTTP APIs.
- `src/shared`: browser-safe catalog validation and types. These files must not import backend code.
- `scripts`: migration and sync entry points.
- `db/migrations`: ordered SQL files and migration ledger.

### Data model

`Merchant 1 — 1 MerchantConnection`, `Merchant 1 — N Product`. Table shapes are declared as TypeScript entities next to their modules (`merchant.entity.ts`, `merchant-connection.entity.ts`, `product.entity.ts`). `MerchantStatus` and `CatalogProduct` are read models, not table rows.

Merchant connections store connector type, non-secret configuration, enabled flag, last attempt/success times, and last error. One connection per merchant deliberately keeps ownership simple. Products have a unique `(merchant_id, external_id)` constraint, so different stores may reuse the same SKU without colliding. Money uses integer minor units, not floating-point storage. Inventory is a non-negative integer; unavailable products stay searchable unless `inStock=true`.

### Sync semantics

1. Acquire a PostgreSQL advisory lock for the connection; concurrent sync attempts fail fast.
2. Fetch the entire source snapshot, with a 10-second HTTP timeout.
3. Validate the entire normalized catalog, including unique external IDs, quantities, money, and HTTP(S) URLs, before modifying products.
4. In one database transaction, upsert products, reactivate returning items, mark missing items inactive, and record success.
5. On failure, roll back product writes, preserve the last good catalog and last successful sync time, and record the error. Release the lock in all paths.

An explicitly complete empty snapshot deactivates all products for that merchant. A failed or incomplete fetch does not. Repeated syncs preserve product IDs; update timestamps represent the latest observation. Sync is manual and full-snapshot only, capped at 10,000 products per merchant for this MVP. Pagination, delta imports, scheduled jobs, retries, variants, and multi-location inventory are intentionally deferred.

### Search

PostgreSQL maintains an English `tsvector` from product name and description, indexed with GIN. `websearch_to_tsquery` supports word matching, phrases and OR; relevance plus name and ID gives deterministic ordering. This is word-based search, not typo correction or substring matching. Price and stock filters run in SQL. Count and page are read from one repeatable-read snapshot so they stay consistent during sync.

### Boundaries

Do not expose this development app to the public internet without auth. Connector responses are treated as untrusted data; only normalized validated values reach storage. Shopify credentials are stored encrypted, not in connection config.

## Troubleshooting

- **Catalog setup screen / 503:** check `.env`, database health, and `npm run db:migrate`.
- **Sync fetch failed:** check the Shopify connection and scopes. The previous catalog remains intact.
- **No products:** connect a Shopify store, then run `npm run sync` once a Shopify connector exists.
- **Port conflict:** change `DATABASE_URL` to match your PostgreSQL port.

Next.js installation reference: https://nextjs.org/docs/app/getting-started/installation

### Source boundaries

`src/app` contains Next.js entry points and UI. `src/server` contains database access, commerce services, and connectors. `src/shared` contains browser-safe schemas and types. Folder names alone do not enforce runtime isolation. The boundary regression test checks local client/shared imports.
