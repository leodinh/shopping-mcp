# Shopping MCP

**Shopping with Agent** lets a shopper ask their AI assistant to search and compare products across connected stores. Merchants connect a Shopify store; it is searched live, through Shopify's API, nothing copied and exposed to assistants through an MCP server. "Shopping MCP" is the protocol, config, and repo name.

- `/`: shopper-facing home page with an example conversation and the `shopping-mcp.json` download.
- `/docs`: how to add Shopping MCP to an assistant.
- `/profile`: a signed-in user's account and connected stores: status (**Connected** or **Disconnected**, from the connection alone), **Disconnect** (search stops reaching the store, after an inline confirmation), and **Connect store**. One user can own several stores. Protected: signed out, it redirects to the home page.
- `/login`: Continue with Google, or an email magic link; shared by the dashboard and MCP clients' OAuth.

This is a development app: auth and data isolation are not ready for public deployment. Product context lives in `PRODUCT.md`; domain terms (Merchant, MerchantConnection, Store connection, …) in `CONTEXT.md`.

More docs in [`docs/`](docs):

- [Authentication](docs/authentication.md): sign-in, sessions, how assistants sign in (CIMD, DCR, tokens), magic-link email, Google, and local vs tunnel profiles.
- [Development tunnel](docs/development-tunnel.md): exposing local servers over HTTPS through Cloudflare for external assistants and provider callbacks.

## Local setup

Prerequisites: Node.js 22+, pnpm, PostgreSQL 17+, and a Shopify app for connecting stores (see [Shopify app setup](#shopify-app-setup)).

1. Create an empty `shopping-mcp` database.
2. Install and configure:

   ```sh
   pnpm install
   cp .env.example .env
   ```

3. Fill in `.env` (see [Configuration](#configuration)). At minimum: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `CREDENTIALS_KEY`, and the `SHOPIFY_*` values.
4. Migrate and start:

   ```sh
   pnpm run db:migrate
   pnpm dev
   ```

`pnpm dev` starts two processes: the Next.js UI at http://127.0.0.1:3000 and the Nest API and MCP server at http://127.0.0.1:3001. Start them separately with `pnpm dev:web` and `pnpm dev:api`.

Then open http://localhost:3000/login and sign in. Without `RESEND_API_KEY` the magic link is printed in the API log; with it, it's emailed. Then connect a Shopify store from `/profile`. Details in [docs/authentication.md](docs/authentication.md).

## Configuration

All variables live in the root `.env`.

| Variable                                    | Required | Purpose                                                                                                                                                                                        |
| ------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                              | yes      | PostgreSQL URL including the user, e.g. `postgresql://USER@localhost:5432/shopping-mcp`. Add `:PASSWORD` only if the server needs one.                                                         |
| `SESSION_SECRET`                            | legacy   | Only decrypts Shopify credentials stored before `CREDENTIALS_KEY` existed (re-encrypted the next time they're used). Not used for sign-in.                                                     |
| `CREDENTIALS_KEY`                           | yes      | Encrypts stored Shopify tokens. **Must not change after use** (see below).                                                                                                                     |
| `SHOPIFY_API_KEY`                           | yes      | Your Shopify app's client ID.                                                                                                                                                                  |
| `SHOPIFY_API_SECRET`                        | yes      | Your Shopify app's client secret. Verifies OAuth callbacks (HMAC) and exchanges tokens.                                                                                                        |
| `SHOPIFY_SCOPES`                            | no       | Requested scopes; default `read_products`.                                                                                                                                                     |
| `API_PORT`                                  | no       | API port; default `3001`.                                                                                                                                                                      |
| `BETTER_AUTH_SECRET`                        | yes      | Signs Better Auth sessions and OAuth state (dashboard and MCP sign-in). Generate separately.                                                                                                   |
| `RESEND_API_KEY`                            | no       | Resend API key (send-only) for magic-link emails. Unset: links are printed to the API console (local development).                                                                             |
| `EMAIL_FROM`                                | no       | Sender, on a domain verified in Resend. Default `onboarding@resend.dev` only delivers to your own Resend account email.                                                                        |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no       | Enable "Continue with Google". Register `<API_ORIGIN>/api/auth/callback/google` as an authorized redirect URI. Signing in with Google and by email link for the same address is the same user. |
| `WEB_ORIGIN`                                | no       | Web UI origin (CORS, trusted origin, login/consent pages); default `http://localhost:3000`.                                                                                                    |
| `API_ORIGIN`                                | no       | Public API origin: Better Auth issuer (`<origin>/api/auth`) and MCP resource (`<origin>/api/mcp`); default `http://localhost:3001`.                                                            |
| `COOKIE_DOMAIN`                             | no       | Parent domain for cross-subdomain session cookies (e.g. `leodev.online` for `app.` / `api.` siblings); unset on localhost.                                                                     |
| `NEXT_PUBLIC_API_ORIGIN`                    | no       | API origin the web UI calls; default `http://localhost:3001`.                                                                                                                                  |

Generate each secret separately, e.g. `openssl rand -hex 32`. Changing `CREDENTIALS_KEY` makes stored Shopify tokens unreadable, and those stores must reconnect. Credentials encrypted before `CREDENTIALS_KEY` existed (with the old `SESSION_SECRET`-derived key) still decrypt and are re-encrypted on their next sync.

### Shopify app setup

One Shopify app serves every merchant; merchants never configure anything. In your app's settings (Dev Dashboard at dev.shopify.com, or the Partner Dashboard for older apps):

1. Copy the client ID and secret into `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET`.
2. Add `<API_ORIGIN>/api/connections/shopify/callback` to the allowed redirect URLs, character for character (`127.0.0.1` ≠ `localhost`, `http` ≠ `https`, port and trailing slash matter): `http://localhost:3001/api/connections/shopify/callback` locally, `https://shopping-api-dev.leodev.online/api/connections/shopify/callback` on the tunnel. The callback always follows `API_ORIGIN`, because the browser must return to the host that set its `oauth_binding` cookie. On the Dev Dashboard, settings live in a version: create and **release** it.
3. Add one redirect URL per environment you run (local, staging, production), or use a separate app per environment.
4. Only stores the app's distribution allows can connect: custom distribution limits installs to specific stores; public distribution allows any store.
5. Point the mandatory compliance webhooks (`customers/data_request`, `customers/redact`, `shop/redact`) at `https://<api-host>/api/webhooks/shopify`. They can only be set in app settings, not through the API, and public distribution requires them.

The `app/uninstalled` webhook needs no setup: after each connect, the API subscribes the shop to the same endpoint, whose URL comes from `API_ORIGIN`. Shopify only delivers to HTTPS, so with a plain `http://` `API_ORIGIN` (local development) the subscription is skipped with a warning.

If the dashboard rejects an `http://` URL, use the HTTPS tunnel ([docs/development-tunnel.md](docs/development-tunnel.md)): run with `API_ORIGIN` set to the tunnel and register its callback.

## Commands

| Command                        | Purpose                                                  |
| ------------------------------ | -------------------------------------------------------- |
| `pnpm dev`                     | Web :3000 and API :3001                                  |
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

Endpoint: `http://127.0.0.1:3001/api/mcp`. `GET /mcp.json` downloads a `shopping-mcp.json` config pointing at it; add that to an assistant as a custom MCP server. Tools call catalog functions; they never talk to Shopify themselves.

| Tool               | Backend             | Purpose                                                                           |
| ------------------ | ------------------- | --------------------------------------------------------------------------------- |
| `search_products`  | `searchProducts()`  | Search every connected store live by keywords, price, merchant, stock, country    |
| `get_product`      | `getProduct()`      | One product, live from its store, by the ID search returned                       |
| `compare_products` | `compareProducts()` | Consistent, live details for 2–5 products so an assistant can explain differences |
| `get_checkout`     | `getCheckout()`     | Look up a merchant checkout URL; currently returns `supported: false`             |
| `get_account`      | `getAccount()`      | The signed-in User and their stores; requires sign-in                             |

Tool inputs use the catalog's own schemas from `packages/contracts`, so a tool never advertises input the catalog would reject. `search_products` takes real types: `maxPrice` is a number in major units (`19.99` = 19.99 USD) and requires `currency`; `inStock` is a boolean; `country` (ISO 3166) prices products for the buyer's market. A product ID is `shopify:<merchantId>:<productId>`.

## HTTP API

```sh
curl 'http://127.0.0.1:3001/api/products?q=black+backpack&currency=USD&maxPrice=100'
curl 'http://127.0.0.1:3001/api/products?inStock=true&limit=5'
curl 'http://127.0.0.1:3001/api/products?inStock=true&limit=5&cursor=<nextCursor>'
curl 'http://127.0.0.1:3001/api/merchants'
```

`GET /api/products` accepts `q` (up to 200 characters), optional `merchantId` (UUID), `country` (ISO 3166, e.g. `CA`), `currency` (ISO 4217; only products priced in it are returned), `maxPrice` (non-negative number in major units; requires `currency`), `inStock` (`true`/`false`), `limit` (1–100, default 24), and `cursor`. It returns `{ products, nextCursor, hasMore, partial, unavailable }`; for the next page, send the same parameters plus `cursor=<nextCursor>`. There is no total: it can't be computed cheaply across live stores. Each product has its ID, merchant, name, description, `price { amountMinor, currency }` (its cheapest variant), `available`, `brand`, `gtin`, `sku`, images, product URL and up to 20 variants. Invalid filters or a bad cursor return 400; 503 means no store could be reached. The controller only converts query strings into the same typed search the MCP tool uses.

Prices are in each currency's own minor units (cents for USD, none for JPY, three digits for KWD). The API filters by currency; it never converts between currencies.

## Architecture

```text
apps/web (Next :3000) ──credentialed fetch──> apps/api (Nest :3001) ──> packages/commerce ──> PostgreSQL
                                                                               │          (users, stores,
                                                                               │           connections)
                                                                               └──> Shopify Admin API
                                                                                    (live search, per store)
```

This is a **pnpm workspace**, not a distributed commerce backend. Business operations live in `packages/commerce`. Import its feature entry points (`@shopping-mcp/commerce/catalog`, `/merchants`, `/auth`, `/store-connection`, and `/connectors/shopify`); there is no root barrel export.

- `packages/database`: Drizzle schema, pool, migrations, and a test-only isolated-schema helper (`@shopping-mcp/database/testing`).
- `packages/contracts`: browser-safe schemas and JSON types shared by the API, MCP tools, and web client.
- `packages/commerce`: catalog search (the `ProductProvider` contract and live federated search), merchants, accounts, Store connection (Shopify OAuth), and the Shopify provider.
- `packages/config`: server-only environment helpers.
- `apps/api`: Nest HTTP controllers, cookies, OAuth responses, and MCP tools.
- `apps/web`: shopper, docs, and profile UI only.

### Data model

`Merchant 1 — 1 MerchantConnection`. Table shapes are declared in `packages/database/src/schema.ts`. `SellerStatus` and `CatalogProduct` are read models, not table rows. Products are never stored: Shopify is the source of truth.

A MerchantConnection stores the connector type, non-secret configuration, the shop domain and Shopify shop GID, encrypted credentials with their expiry times, when the shop was verified, the enabled flag, and why it was last disabled. A Merchant is bound to one shop and never switches shops; a shop belongs to at most one Merchant.

### Store connection

`@shopping-mcp/commerce/store-connection` owns the Shopify OAuth lifecycle behind two operations:

1. **Begin** (signed-in User only): validate the `*.myshopify.com` domain, reject a shop owned by another User (`shop_taken`), and store a single-use OAuth attempt for the User and shop, tied to the browser by an `oauth_binding` cookie (10 minutes). Nothing is created for the shop yet.
2. **Complete**: verify the callback HMAC, consume the attempt, exchange the code for tokens and **verify** the new token with one Admin GraphQL `shop { id name }` call, both outside any DB transaction. Then in one transaction create the Merchant for the User, or **claim** it if it predates Users, set its name to the shop's name, and store encrypted credentials with the shop GID and `verified_at`. Nothing is imported: the store is searchable at once. The browser returns to `/profile`; Shopify never signs anyone in.

Both return typed outcomes (`{ ok: false, reason }`); the API maps each reason to an HTTP status. Connecting while signed out is a 401. A failed token exchange uses up the attempt; the User starts again. **Disconnect** (dashboard) and the `app/uninstalled` webhook share one path: disable the connection, drop its credentials, hide its products.

### Search

Search is **live and federated**: `LiveProductSearchService` (behind the `ProductSearchService` interface) asks every enabled store at once, through one `ProductProvider` per store.

1. **Fan-out.** Stores are queried concurrently (at most 8 at a time), each with a timeout (`SEARCH_STORE_TIMEOUT_MS`, default 5s). Each is first asked for `max(1, ceil(limit / stores))` products.
2. **Merge.** Results are interleaved round-robin, so every merchant gets balanced exposure. Stores that still have results are asked again until the page is full or every store is exhausted. The rotation carries over between pages.
3. **Paging.** `nextCursor` is stateless, opaque and HMAC-signed (key derived from `BETTER_AUTH_SECRET`). It holds each store's Shopify position and whether it's exhausted, the store order, whose turn is next, a fingerprint of the query and filters, a version, and a 30-minute expiry. A store's position advances only past products actually returned, so fetched but unreturned products come back on the next page. Each request re-checks the signature, expiry, parameters and which stores are still connected. Nothing is stored server-side.
4. **Failures.** A store that errors or times out is listed in `unavailable`, and the page is marked `partial`. It keeps its position and is retried on the next page. An empty store is a success, not a failure. The search fails (503) only if every store tried fails; with no connected stores it returns an empty result.
5. **Shopify.** Only products that are active and published to the online store are searchable. Search words are quoted, so text can never become a Shopify filter. `maxPrice` goes to Shopify's `price` filter, or with `country` (market prices) is checked after fetching. `inStock` (any variant for sale) and `currency` (the product's returned currency) are checked after fetching. Tokens are refreshed when used, under a per-store Postgres advisory lock, because Shopify refresh tokens work only once.

### Shopify webhooks

`POST /api/webhooks/shopify` verifies `X-Shopify-Hmac-Sha256` against the raw request body, then acts on `X-Shopify-Topic`:

- `app/uninstalled`: disable the connection and delete its credentials, so search stops reaching the store at once. Reconnecting re-enables it.
- `shop/redact` (48h after uninstall): delete the Merchant and everything held for the shop.
- `customers/data_request`, `customers/redact`: acknowledged; no customer data is stored.

Bad signatures get 401; processing errors get 503 so Shopify retries.

### Boundaries

Do not expose this development app to the public internet without auth. Provider responses are untrusted data: every product is normalized and validated before it leaves the provider, and malformed products are skipped. Shopify credentials are encrypted with `CREDENTIALS_KEY` (AES-256-GCM), never stored in connection config.

`apps/web` contains Next.js UI. `packages/commerce` and `packages/database` contain backend implementation. Timestamps in responses are ISO strings. Boundary tests check package subpaths, relative imports, and web aliases: shared packages cannot import apps, commerce cannot import HTTP/MCP frameworks, and web and contracts cannot import backend packages (Next.js's own APIs, such as `next/headers`, are allowed in web).

## Tests

Tests live in their owning workspace's `tests/` directory:

- `apps/api/tests`: HTTP basics (signed-out dashboard) and the Store connection failure → status table. `integration/`: Shopify connect end to end over HTTP (signed in), MCP OAuth token checks, and JSON-RPC calls to `/api/mcp` plus REST search.
- `apps/web/tests`: API URL helpers and profile response validation.
- `packages/commerce/tests`: money (per-currency minor units), the Shopify provider (query building, normalization, filters), and live federated search (merge, refill, paging, cursors, failures, timeouts). `integration/`: Store connection, Shopify token refresh (including concurrent refresh), and webhooks against PostgreSQL.
- `packages/contracts/tests`: search and product-ID schemas.
- `packages/config/tests`: environment helpers.
- Root `tests/`: repository architecture boundaries only.

Run one workspace with `pnpm --filter @shopping-mcp/api test` or `pnpm --filter @shopping-mcp/commerce test`. Root `pnpm test` runs all database-free suites.

For integration tests, point `DATABASE_URL` at a disposable PostgreSQL database, run `pnpm db:migrate`, then `pnpm test:integration`. Workspace integration scripts load the root `.env`; an explicitly set `DATABASE_URL` takes precedence. Most integration tests run in a throwaway schema from `createTestDatabase()`; the MCP HTTP and dashboard tests use the migrated database and create uniquely named records. Shopify is never called: Store connection tests inject a fake token exchange and shop check, token-refresh tests stub `fetch`, search tests use fake providers, and the MCP HTTP test answers every `*.myshopify.com` request itself.

The API runs TypeScript through `tsx`; they do not emit build artifacts. `pnpm build` checks all workspaces and builds the web app.

## Troubleshooting

- **`redirect_uri is not whitelisted`** from Shopify: add `<API_ORIGIN>/api/connections/shopify/callback`, exactly, to the Shopify app's allowed redirect URLs and release the version ([Shopify app setup](#shopify-app-setup)).
- **"Shopify access expired. Reconnect your store."** on `/profile`: the refresh token expired (Shopify tokens are refreshed only when used, so 90 days without a search reaching the store) or the app was uninstalled. The store shows **Disconnected**. Connect the same shop again.
- **"Could not send the sign-in link"**: the API log shows Resend's reason. With the default test sender, Resend only delivers to your own Resend account email; verify a domain in Resend and set `EMAIL_FROM` to an address on it.
- **`CREDENTIALS_KEY is required`**: set it in `.env`; see [Configuration](#configuration).
- **Catalog setup screen / 503**: check `.env`, database health, and `pnpm run db:migrate`.
- **No products**: only products that are active and published to the online store are searchable. Check the store is **Connected** on `/profile`. If a result lists it in `unavailable`, it didn't answer in time.
- **"Shopify app uninstalled. Reconnect your store."** on `/profile`: the app was uninstalled from the shop. Connect it again.
- **Database connection refused**: make sure `DATABASE_URL` matches your PostgreSQL host and port.
- **Migration ledger errors on an old database**: databases built by the old SQL runner must be recreated before `pnpm run db:migrate`.
