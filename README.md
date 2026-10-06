# Shopping MCP

**Shopping with Agent** lets a shopper ask their AI assistant to search and compare products across connected stores. Merchants connect a Shopify store; its catalog is synced into PostgreSQL and exposed to assistants through an MCP server. "Shopping MCP" is the protocol, config, and repo name.

- `/`: shopper-facing home page with an example conversation and the `shopping-mcp.json` download.
- `/docs`: how to add Shopping MCP to an assistant.
- `/seller`: merchants connect their Shopify store and see connection state, product count, and sync status, with a sync/retry button. "Disconnect" currently only signs the seller out; the store keeps syncing.

This is a development app: auth and data isolation are not ready for public deployment. Product context lives in `PRODUCT.md`; domain terms (Merchant, MerchantConnection, Store connection, …) in `CONTEXT.md`.

## Local setup

Prerequisites: Node.js 22+, pnpm, PostgreSQL 17+, and a Shopify app for connecting stores (see [Shopify app setup](#shopify-app-setup)).

1. Create an empty `shopping-mcp` database.
2. Install and configure:

   ```sh
   pnpm install
   cp .env.example .env
   ```

3. Fill in `.env` (see [Configuration](#configuration)). At minimum: `DATABASE_URL`, `SESSION_SECRET`, `CREDENTIALS_KEY`, and the `SHOPIFY_*` values.
4. Migrate and start:

   ```sh
   pnpm run db:migrate
   pnpm dev
   ```

`pnpm dev` starts three processes: the Next.js UI at http://127.0.0.1:3000, the Nest API and MCP server at http://127.0.0.1:3001, and a worker that drains catalog sync every 10s. Start them separately with `pnpm dev:web`, `pnpm dev:api`, and `pnpm dev:worker`.

Then open http://127.0.0.1:3000/seller and connect a Shopify store.

## Configuration

All variables live in the root `.env`.

| Variable                 | Required | Purpose                                                                                                                                |
| ------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`           | yes      | PostgreSQL URL including the user, e.g. `postgresql://USER@localhost:5432/shopping-mcp`. Add `:PASSWORD` only if the server needs one. |
| `SESSION_SECRET`         | yes      | Signs seller session cookies. Changing it signs every seller out.                                                                      |
| `CREDENTIALS_KEY`        | yes      | Encrypts stored Shopify tokens. **Must differ from `SESSION_SECRET` and must not change after use** (see below).                       |
| `SHOPIFY_API_KEY`        | yes      | Your Shopify app's client ID.                                                                                                          |
| `SHOPIFY_API_SECRET`     | yes      | Your Shopify app's client secret. Verifies OAuth callbacks (HMAC) and exchanges tokens.                                                |
| `SHOPIFY_REDIRECT_URI`   | yes      | OAuth callback, `http://127.0.0.1:3001/api/connections/shopify/callback` locally. Must be allowed in the Shopify app.                  |
| `SHOPIFY_SCOPES`         | no       | Requested scopes; default `read_products`.                                                                                             |
| `API_PORT`               | no       | API port; default `3001`.                                                                                                              |
| `WEB_ORIGIN`             | no       | Web UI origin for CORS and the post-OAuth redirect; default `http://127.0.0.1:3000`.                                                   |
| `NEXT_PUBLIC_API_ORIGIN` | no       | API origin the web UI calls; default `http://127.0.0.1:3001`.                                                                          |

Generate each secret separately, e.g. `openssl rand -hex 32`. Rotating `SESSION_SECRET` only signs sellers out. Changing `CREDENTIALS_KEY` makes stored Shopify tokens unreadable, and those stores must reconnect. Credentials encrypted before `CREDENTIALS_KEY` existed (with the old `SESSION_SECRET`-derived key) still decrypt and are re-encrypted on their next sync.

### Shopify app setup

One Shopify app serves every merchant; merchants never configure anything. In your app's settings (Dev Dashboard at dev.shopify.com, or the Partner Dashboard for older apps):

1. Copy the client ID and secret into `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET`.
2. Add `SHOPIFY_REDIRECT_URI` to the allowed redirect URLs, character for character (`127.0.0.1` ≠ `localhost`, `http` ≠ `https`, port and trailing slash matter). On the Dev Dashboard, settings live in a version: create and **release** it.
3. Add one redirect URL per environment you run (local, staging, production), or use a separate app per environment.
4. Only stores the app's distribution allows can connect: custom distribution limits installs to specific stores; public distribution allows any store.
5. Point the mandatory compliance webhooks (`customers/data_request`, `customers/redact`, `shop/redact`) at `https://<api-host>/api/webhooks/shopify`. They can only be set in app settings, not through the API, and public distribution requires them.

The `app/uninstalled` webhook needs no setup: after each connect, the API subscribes the shop to the same endpoint, whose URL comes from `SHOPIFY_REDIRECT_URI`. Shopify only delivers to HTTPS, so with a plain `http://` redirect URI (local development) the subscription is skipped with a warning.

If the dashboard rejects an `http://` URL, expose the API through an HTTPS tunnel (`cloudflared tunnel --url http://127.0.0.1:3001` or `ngrok http 3001`) and use that URL for both the dashboard and `SHOPIFY_REDIRECT_URI`.

## Commands

| Command                        | Purpose                                                  |
| ------------------------------ | -------------------------------------------------------- |
| `pnpm dev`                     | Web :3000, API :3001, and the sync worker                |
| `pnpm run db:migrate`          | Apply outstanding SQL migrations transactionally         |
| `pnpm run db:setup`            | Same as `db:migrate`                                     |
| `pnpm test`                    | Workspace tests and architecture boundaries; no database |
| `pnpm run test:integration`    | Real PostgreSQL tests; migrate first                     |
| `pnpm typecheck`               | TypeScript validation                                    |
| `pnpm lint` / `lint:fix`       | ESLint across all workspaces                             |
| `pnpm format` / `format:check` | Prettier                                                 |
| `pnpm build`                   | Typecheck every workspace, then build the Next.js app    |

ESLint checks code quality; Prettier handles formatting (`eslint-config-prettier` disables conflicting rules). Generated output and environment files are excluded from formatting. Never run local tooling against a production database.

## MCP server

Endpoint: `http://127.0.0.1:3001/api/mcp`. `GET /mcp.json` downloads a `shopping-mcp.json` config pointing at it; add that to an assistant as a custom MCP server. Tools call catalog functions; they do not query SQL directly.

| Tool               | Backend             | Purpose                                                                              |
| ------------------ | ------------------- | ------------------------------------------------------------------------------------ |
| `search_products`  | `searchProducts()`  | Find products using keywords, price, merchant, and availability                      |
| `get_product`      | `getProductById()`  | Retrieve one product by its internal ID                                              |
| `compare_products` | `compareProducts()` | Retrieve consistent details for 2–5 products so an assistant can explain differences |
| `get_checkout`     | `getCheckout()`     | Look up a merchant checkout URL; currently returns `supported: false`                |

Tool inputs use the catalog's own schemas from `packages/contracts`, so a tool never advertises input the catalog would reject. `search_products` takes real types: `maxPrice` is a number in major units (`19.99` = 19.99 USD) and requires `currency`; `inStock` is a boolean. Without `currency`, search spans every currency and each product carries its own. `compare_products` takes 2–5 distinct product IDs.

## HTTP API

```sh
curl 'http://127.0.0.1:3001/api/products?q=black+backpack&maxPrice=100'
curl 'http://127.0.0.1:3001/api/products?inStock=true&limit=5&offset=0'
curl 'http://127.0.0.1:3001/api/merchants'
```

`GET /api/products` accepts `q` (up to 200 characters), optional `merchantId` (UUID), optional `currency` (ISO 4217, e.g. `USD`; omit to search every currency), `maxPrice` (non-negative number in major units; requires `currency`), `inStock` (`true`/`false`), `limit` (1–100, default 24), and `offset` (0–100000). It returns `{ products, total, limit, offset }`. Each product includes its merchant, stable internal ID, external ID, name, description, `priceMinor`, currency, images, inventory, product URL, and update time. Invalid filters return 400; database unavailability returns 503 without database details. The controller only converts query strings into the same typed search the MCP tool uses.

The API filters by currency; it does not convert currencies. Prices assume two-decimal currencies (see issue #7).

## Architecture

```text
apps/web (Next :3000) ──credentialed fetch──> apps/api (Nest :3001) ──> packages/commerce ──> PostgreSQL
                                                                               ↑
apps/worker (no HTTP) ── every 10s drainSyncRuns ── sync_runs outbox ─────────┘
```

This is a **pnpm workspace**, not a distributed commerce backend. Business operations live in `packages/commerce` and are shared by the API and worker. Import its feature entry points (`@shopping-mcp/commerce/catalog`, `/merchants`, `/auth`, `/sync`, `/store-connection`, `/connectors`, and `/connectors/shopify`); there is no root barrel export.

- `packages/database`: Drizzle schema, pool, migrations, and a test-only isolated-schema helper (`@shopping-mcp/database/testing`).
- `packages/contracts`: browser-safe schemas and JSON types shared by the API, MCP tools, and web client.
- `packages/commerce`: catalog, merchants, sessions, Store connection (Shopify OAuth), sync, and connectors.
- `packages/config`: server-only environment helpers.
- `apps/api`: Nest HTTP controllers, cookies, OAuth responses, and MCP tools.
- `apps/worker`: outbox drain loop.
- `apps/web`: shopper, docs, and seller UI only.

### Data model

`Merchant 1 — 1 MerchantConnection`, `Merchant 1 — N Product`. Table shapes are declared in `packages/database/src/schema.ts`. `SellerStatus` and `CatalogProduct` are read models, not table rows.

A MerchantConnection stores the connector type, non-secret configuration, the shop domain, encrypted credentials with their expiry times, the enabled flag, last attempt/success times, and the last error. A Merchant is bound to one shop and never switches shops; a shop belongs to at most one Merchant. Products have a unique `(merchant_id, external_id)` constraint, so different stores may reuse the same SKU. Money uses integer minor units, not floating-point storage. Inventory is a non-negative integer; unavailable products stay searchable unless `inStock=true`.

### Store connection

`@shopping-mcp/commerce/store-connection` owns the Shopify OAuth lifecycle behind two operations:

1. **Begin**: validate the `*.myshopify.com` domain, pick the signed-in Merchant or the one that owns (or will own) the shop, reject a shop owned by another Merchant (`shop_taken`) or a Merchant already bound to another shop (`shop_mismatch`), and store a single-use OAuth attempt tied to the browser by an `oauth_binding` cookie (10 minutes).
2. **Complete**: verify the callback HMAC, consume the attempt, exchange the code for tokens outside any DB transaction, then store encrypted credentials, request a sync, and create the seller session in one transaction.

Both return typed outcomes (`{ ok: false, reason }`); the API maps each reason to an HTTP status. A stale session cookie counts as signed out. A failed token exchange uses up the attempt; the seller starts again.

### Sync semantics

1. Enqueue a `sync_runs` row (`pending`) on Store connection or seller retry. Dedup if pending/running already exists.
2. The worker claims one run every 10s (`running`, or stale `running` older than 10 minutes), then:
   1. Acquire a PostgreSQL advisory lock for the connection; concurrent sync attempts fail fast.
   2. The connector prepares its credentials. Shopify access tokens expire after an hour: within 5 minutes of expiry the connector refreshes them and stores the rotated tokens immediately, before fetching. A rejected refresh fails with "Shopify access expired. Reconnect your store."
   3. Fetch the entire source snapshot, with a 10-second HTTP timeout.
   4. Validate the entire normalized catalog, including unique external IDs, quantities, money, and HTTP(S) URLs, before modifying products.
   5. In one database transaction, upsert products, reactivate returning items, mark missing items inactive, and record success.
   6. On failure, roll back product writes, preserve the last good catalog and last successful sync time, and record the error. Release the lock in all paths.
3. Mark the run `succeeded` or `failed`.

An explicitly complete empty snapshot deactivates all products for that merchant. A failed or incomplete fetch does not. Repeated syncs preserve product IDs; update timestamps represent the latest observation. Sync is full-snapshot only, capped at 10,000 products per merchant. Delta imports, variants, and multi-location inventory are intentionally deferred.

### Search

PostgreSQL maintains an English `tsvector` from product name and description, indexed with GIN. `websearch_to_tsquery` supports word matching, phrases, and OR; relevance plus name and ID gives deterministic ordering. This is word-based search, not typo correction or substring matching. Price and stock filters run in SQL; `maxPrice` is compared with exact `numeric` math, so values like `19.999` behave correctly. Count and page are read from one repeatable-read snapshot so they stay consistent during sync.

### Shopify webhooks

`POST /api/webhooks/shopify` verifies `X-Shopify-Hmac-Sha256` against the raw request body, then acts on `X-Shopify-Topic`:

- `app/uninstalled`: disable the connection, delete its credentials, and mark its products inactive so the store drops out of search at once. Reconnecting re-enables it, and the sync it requests reactivates the products.
- `shop/redact` (48h after uninstall): delete the Merchant and everything held for the shop.
- `customers/data_request`, `customers/redact`: acknowledged; no customer data is stored.

Bad signatures get 401; processing errors get 503 so Shopify retries.

### Boundaries

Do not expose this development app to the public internet without auth. Connector responses are treated as untrusted data; only normalized, validated values reach storage. Shopify credentials are encrypted with `CREDENTIALS_KEY` (AES-256-GCM), never stored in connection config.

`apps/web` contains Next.js UI. `packages/commerce` and `packages/database` contain backend implementation. Timestamps in responses are ISO strings. Boundary tests check package subpaths, relative imports, and web aliases: shared packages cannot import apps, commerce cannot import HTTP/MCP frameworks, and web and contracts cannot import backend packages.

## Tests

Tests live in their owning workspace's `tests/` directory:

- `apps/api/tests`: HTTP basics, session cookies, and the Store connection failure → status table. `integration/`: Shopify connect end to end over HTTP, and JSON-RPC calls to `/api/mcp` plus REST search.
- `apps/web/tests`: API URL helpers and seller response validation.
- `apps/worker/tests`: outbox scheduling.
- `packages/commerce/tests`: catalog helpers, Shopify product mapping, and snapshot validation. `integration/`: Store connection, Shopify token refresh, catalog lifecycle, and the sync outbox against PostgreSQL.
- `packages/contracts/tests`: search and product-ID schemas.
- `packages/config/tests`: environment helpers.
- Root `tests/`: repository architecture boundaries only.

Run one workspace with `pnpm --filter @shopping-mcp/api test` or `pnpm --filter @shopping-mcp/commerce test`. Root `pnpm test` runs all database-free suites.

For integration tests, point `DATABASE_URL` at a disposable PostgreSQL database, run `pnpm db:migrate`, then `pnpm test:integration`. Workspace integration scripts load the root `.env`; an explicitly set `DATABASE_URL` takes precedence. Most integration tests run in a throwaway schema from `createTestDatabase()`; the catalog lifecycle and MCP HTTP tests use the migrated database and create uniquely named records. Shopify is never called: Store connection tests inject a fake token exchange, token-refresh tests stub `fetch`, and catalog and outbox tests use fake connectors.

The API and worker run TypeScript through `tsx`; they do not emit build artifacts. `pnpm build` checks all workspaces and builds the web app.

## Troubleshooting

- **`redirect_uri is not whitelisted`** from Shopify: add `SHOPIFY_REDIRECT_URI`, exactly, to the Shopify app's allowed redirect URLs and release the version ([Shopify app setup](#shopify-app-setup)).
- **"Shopify access expired. Reconnect your store."** on `/seller`: the refresh token expired (90 days without a sync) or the app was uninstalled. Connect the same shop again.
- **`CREDENTIALS_KEY is required`**: set it in `.env`; see [Configuration](#configuration).
- **Catalog setup screen / 503**: check `.env`, database health, and `pnpm run db:migrate`.
- **Sync fetch failed**: check the Shopify connection and scopes. The previous catalog remains intact.
- **No products**: connect a Shopify store, then wait for the worker or use Retry sync on `/seller`.
- **"Shopify app uninstalled. Reconnect your store."** on `/seller`: the app was uninstalled from the shop. Connect it again.
- **Database connection refused**: make sure `DATABASE_URL` matches your PostgreSQL host and port.
- **Migration ledger errors on an old database**: databases built by the old SQL runner must be recreated before `pnpm run db:migrate`.
