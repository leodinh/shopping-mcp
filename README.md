# Shopping MCP

### Seller UI

The home page now shows only **Connect Your Store**, followed by that selected store's connection state, product count, sync status, last synced time, and sync/retry button. It does not display product listings, search controls, other merchants' status, or API links. Cross-merchant search remains available through the API below.

After Shopify OAuth, a session cookie identifies the connected merchant for the seller dashboard. Do not deploy this app publicly without reviewing auth and data isolation.

## Local setup

Prerequisites: Node.js 22+, pnpm, and PostgreSQL 17+.

From this directory:

```sh
pnpm install
cp .env.example .env
pnpm run db:migrate
pnpm dev
```

That starts three processes: Next.js UI at http://127.0.0.1:3000, Nest API at http://127.0.0.1:3001, and a worker that drains catalog sync every 10s. You can also start them separately with `pnpm dev:web`, `pnpm dev:api`, and `pnpm dev:worker`.

Existing databases built by the old SQL runner must be recreated before `pnpm run db:migrate`, because the migration ledger changed.

Open http://127.0.0.1:3000/seller and connect a Shopify store. The seller page shows that store's connection state, product count, and sync status.

Create an empty `shopping-mcp` database and set `DATABASE_URL` in `.env`. Include the PostgreSQL user (`postgresql://USER@localhost:5432/shopping-mcp`). Add `:PASSWORD` after the user only when the server requires one. Localhost credentials are for development only.

## Commands

### Code quality

- `pnpm lint`: check Next.js, React, and TypeScript rules with ESLint.
- `pnpm lint:fix`: apply available ESLint fixes.
- `pnpm format`: format supported files with Prettier.
- `pnpm format:check`: check formatting without changing files.

ESLint checks code quality; Prettier handles formatting. `eslint-config-prettier` disables conflicting stylistic lint rules. Generated output, environment files, and generated agent instructions are excluded from formatting.

| Command                     | Purpose                                                        |
| --------------------------- | -------------------------------------------------------------- |
| `pnpm dev`                 | Web :3000, API :3001, and the sync worker                      |
| `pnpm run db:migrate`      | Apply outstanding SQL migrations transactionally               |
| `pnpm run db:setup`        | Same as `db:migrate`                                           |
| `pnpm test`                | Contract, HTTP, and worker tests; no database                  |
| `pnpm run test:integration`| Real PostgreSQL lifecycle tests; migrate first                 |
| `pnpm typecheck`           | TypeScript validation                                          |
| `pnpm build`               | Production builds for the workspace apps                       |

Integration tests create uniquely named test merchants and remove only their own records. Never run local tooling against a production database. Repeating sync does not duplicate products.

## HTTP API

```sh
curl 'http://127.0.0.1:3001/api/products?q=black+backpack&maxPrice=100'
curl 'http://127.0.0.1:3001/api/products?inStock=true&limit=5&offset=0'
curl 'http://127.0.0.1:3001/api/merchants'
```

The MCP endpoint is `http://127.0.0.1:3001/api/mcp`. Tools call catalog functions; they do not query SQL directly.

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
apps/web (Next :3000) ──credentialed fetch──> apps/api (Nest :3001) ──> packages/application ──> PostgreSQL
                                                                              ↑
apps/worker (no HTTP) ── every 10s drainSyncRuns ── sync_runs outbox ─────────┘
```

This is a **pnpm workspace**, not a distributed commerce backend. Domain code lives in `packages/application` and is shared by the API and worker.

- `packages/database`: Drizzle schema, pool, and migrations.
- `packages/contracts`: browser-safe Zod types and connector contracts.
- `packages/application`: catalog, merchants, Shopify OAuth, sync, connectors, MCP tool runners.
- `packages/config`: typed environment helpers.
- `apps/api`: Nest HTTP + MCP.
- `apps/worker`: outbox drain loop.
- `apps/web`: seller/docs UI only.

### Data model

`Merchant 1 — 1 MerchantConnection`, `Merchant 1 — N Product`. Table shapes are declared in `packages/database/src/schema.ts`. `MerchantStatus` and `CatalogProduct` are read models, not table rows.

Merchant connections store connector type, non-secret configuration, enabled flag, last attempt/success times, and last error. One connection per merchant deliberately keeps ownership simple. Products have a unique `(merchant_id, external_id)` constraint, so different stores may reuse the same SKU without colliding. Money uses integer minor units, not floating-point storage. Inventory is a non-negative integer; unavailable products stay searchable unless `inStock=true`.

### Sync semantics

1. Enqueue a `sync_runs` row (`pending`) on OAuth connect or seller retry. Dedup if pending/running already exists.
2. The worker claims one run every 10s (`running`, or stale `running` older than 10 minutes), then:
   1. Acquire a PostgreSQL advisory lock for the connection; concurrent sync attempts fail fast.
   2. Fetch the entire source snapshot, with a 10-second HTTP timeout.
   3. Validate the entire normalized catalog, including unique external IDs, quantities, money, and HTTP(S) URLs, before modifying products.
   4. In one database transaction, upsert products, reactivate returning items, mark missing items inactive, and record success.
   5. On failure, roll back product writes, preserve the last good catalog and last successful sync time, and record the error. Release the lock in all paths.
3. Mark the run `succeeded` or `failed`.

An explicitly complete empty snapshot deactivates all products for that merchant. A failed or incomplete fetch does not. Repeated syncs preserve product IDs; update timestamps represent the latest observation. Sync is full-snapshot only, capped at 10,000 products per merchant for this MVP. Pagination, delta imports, variants, and multi-location inventory are intentionally deferred.

### Search

PostgreSQL maintains an English `tsvector` from product name and description, indexed with GIN. `websearch_to_tsquery` supports word matching, phrases and OR; relevance plus name and ID gives deterministic ordering. This is word-based search, not typo correction or substring matching. Price and stock filters run in SQL. Count and page are read from one repeatable-read snapshot so they stay consistent during sync.

### Boundaries

Do not expose this development app to the public internet without auth. Connector responses are treated as untrusted data; only normalized validated values reach storage. Shopify credentials are stored encrypted, not in connection config.

## Troubleshooting

- **Catalog setup screen / 503:** check `.env`, database health, and `pnpm run db:migrate`.
- **Sync fetch failed:** check the Shopify connection and scopes. The previous catalog remains intact.
- **No products:** connect a Shopify store, then wait for the worker or use Retry sync on `/seller`.
- **Port conflict:** change `DATABASE_URL` to match your PostgreSQL port.

Next.js installation reference: https://nextjs.org/docs/app/getting-started/installation

### Source boundaries

`apps/web` contains Next.js UI. `packages/application` and `packages/database` contain backend implementation. `packages/contracts` contains browser-safe schemas and types. The boundary regression test checks that contracts and web client code cannot import backend packages.
