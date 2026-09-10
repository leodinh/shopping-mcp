# Shopping MCP — Milestone 1

### Seller UI

The home page now shows only **Connect Your Store**, followed by that selected store's connection state, product count, sync status, last synced time, and sync/retry button. It does not display product listings, search controls, other merchants' status, or API links. Cross-merchant search remains available through the API below.

The selected demo store is remembered in a 30-day HTTP-only cookie for this browser. This is a local demo preference, **not authentication or merchant authorization**. Existing seeded stores are not automatically shown before selection. Real seller identity and data isolation remain out of scope; do not deploy this unauthenticated app publicly.

A locally runnable commerce core: Next.js App Router, TypeScript, PostgreSQL, three demo merchants, HTTP merchant connector, transactional product sync, cross-merchant search, and an MCP server at `/api/mcp` with `search_products`.

## Local setup

Prerequisites: Node.js 22+, npm, and PostgreSQL 17+.

From this directory:

```sh
npm ci
cp .env.example .env
npm run dev
```

Leave that terminal running. It starts Next.js at http://127.0.0.1:3000 and the fake merchant API at http://127.0.0.1:4001. In a second terminal, from this same directory:

```sh
npm run db:setup
```

This applies migrations, seeds three merchants/connections, and imports 12 products via real HTTP calls to the fake API. Refresh the app. Try **black backpack** with a maximum price of **100**: Northline Supply and Fieldwork Goods both match. All demo prices are USD. Merchant `.example` URLs are intentionally fictional, not real checkout destinations.

For a connect-first experience on a fresh database, run only `npm run db:migrate` instead of `npm run db:setup`. Click **Connect Your Store**, choose a demo store, then **Connect & sync products**. The app creates its connection, imports products, and refreshes the catalog and status cards. Cards show product count, connection state, last successful sync, and **Sync now** / **Retry sync**. Existing seeded connections remain visible; reconnecting does not duplicate products. A failed import retains the connection for retry and preserves any previous catalog.

Create an empty `shopping-mcp` database and set `DATABASE_URL` in `.env`. Include the PostgreSQL user (`postgresql://USER@localhost:5432/shopping-mcp`). Add `:PASSWORD` after the user only when the server requires one. Localhost credentials are for development only.

## Commands

### Code quality

- `npm run lint`: check Next.js, React, and TypeScript rules with ESLint.
- `npm run lint:fix`: apply available ESLint fixes.
- `npm run format`: format supported files with Prettier.
- `npm run format:check`: check formatting without changing files.

ESLint checks code quality; Prettier handles formatting. `eslint-config-prettier` disables conflicting stylistic lint rules. Generated output, environment files, and generated agent instructions are excluded from formatting.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Next.js and demo API together; Ctrl+C stops both |
| `npm run db:migrate` | Apply outstanding SQL migrations transactionally |
| `npm run db:seed` | Idempotently seed merchant identities/connections |
| `npm run sync` | Import all enabled merchant connections |
| `npm run sync -- northline` | Import one merchant |
| `npm test` | Contract, fixture, and input validation tests; no database |
| `npm run test:integration` | Real PostgreSQL lifecycle tests; migrate first |
| `npm run typecheck` | TypeScript validation |
| `npm run build` | Production Next.js build |
| `npm start` | Serve production build; run `npm run demo` separately for sync |

Integration tests create uniquely named test merchants and remove only their own records. Never run local tooling against a production database. Seeding does not delete existing products or re-enable disabled connections. Repeating setup/sync does not duplicate products.

## HTTP API

```sh
curl 'http://127.0.0.1:3000/api/products?q=black+backpack&maxPrice=100'
curl 'http://127.0.0.1:3000/api/products?inStock=true&limit=5&offset=0'
curl 'http://127.0.0.1:3000/api/merchants'
curl 'http://127.0.0.1:4001/stores/northline/products'
```

The MCP endpoint is `http://127.0.0.1:3000/api/mcp`. The `search_products` tool accepts JSON numbers and booleans, translates them into the catalog search filters, and calls the same backend as `GET /api/products`.

`GET /api/products` accepts `q` (up to 200 characters), optional `merchantId` (UUID), `currency` (uppercase, default USD), `maxPrice` (major units, non-negative, up to 2 decimals), `inStock` (`true`/`false`), `limit` (1–100, default 24), and `offset` (0–100000). Returns `{ products, total, limit, offset }`. Each product includes its merchant, stable internal ID, external ID, name, description, `priceMinor`, currency, images, inventory, product URL, and update time. Invalid filters return 400; database unavailability returns 503 without database details. Parameters use prepared SQL, not string interpolation.

The UI focuses on demo USD inventory. The API supports currency filtering, not currency conversion. This milestone assumes currencies with two decimal minor units; zero-/three-decimal currency handling is out of scope. The local UI uses a Next.js Server Action to connect and sync only the three allowlisted demo stores. Arbitrary store URLs and credentials are not accepted. This action has no authentication: keep the app bound to localhost, never publish it as-is. CLI imports remain available.

## Architecture

```text
Next.js page / read-only API / MCP ──> catalog + merchants ──> PostgreSQL
                                                              ↑
sync CLI ──> sync service ──> connector interface ──> demo HTTP API
                 └──────── normalized snapshot ─────────┘
```

This is a **modular monolith**, not a distributed commerce backend. Application modules live in one Next.js project and share one database. The second process only simulates an external merchant for development; it is not an application microservice.

- `src/server/catalog`: `product.entity.ts`, validated search, PostgreSQL full-text search and pagination.
- `src/server/merchants`: `merchant.entity.ts`, `merchant-connection.entity.ts`, and the `MerchantStatus` read model.
- `src/server/connectors`: normalized product contract, validation, registry, demo adapter.
- `src/server/sync`: imports and snapshot reconciliation; no framework dependency.
- `src/server/demo`: deterministic external-store fixtures.
- `src/server/db/client.ts`: pooled database access shared across development reloads.
- `src/server/mcp`: MCP handler and tool adapters (`search_products` maps agent input onto catalog search).
- `src/app`: seller status page, private `_components` and `_actions` folders, and read-only HTTP APIs.
- `src/shared`: browser-safe catalog validation/types and demo store options. These files must not import backend code.
- `scripts`: migration, seed, sync, and demo API entry points.
- `db/migrations`: ordered SQL files and migration ledger.

### Data model

`Merchant 1 — 1 MerchantConnection`, `Merchant 1 — N Product`. Table shapes are declared as TypeScript entities next to their modules (`merchant.entity.ts`, `merchant-connection.entity.ts`, `product.entity.ts`). `MerchantStatus` and `CatalogProduct` are read models, not table rows.

Merchant connections store connector type, non-secret configuration, enabled flag, last attempt/success times, and last error. One connection per merchant deliberately keeps ownership simple. Products have a unique `(merchant_id, external_id)` constraint, so different stores may reuse the same SKU without colliding. Money uses integer minor units, not floating-point storage. Inventory is a non-negative integer; unavailable products stay searchable unless `inStock=true`.

### Sync semantics

1. Acquire a PostgreSQL advisory lock for the connection; concurrent sync attempts fail fast.
2. Fetch the entire source snapshot, with a 10-second HTTP timeout. The demo API must explicitly return `complete: true`.
3. Validate the entire normalized catalog, including unique external IDs, quantities, money, and HTTP(S) URLs, before modifying products.
4. In one database transaction, upsert products, reactivate returning items, mark missing items inactive, and record success.
5. On failure, roll back product writes, preserve the last good catalog and last successful sync time, and record the error. Release the lock in all paths.

An explicitly complete empty snapshot deactivates all products for that merchant. A failed or incomplete fetch does not. Repeated syncs preserve product IDs; update timestamps represent the latest observation. Sync is manual and full-snapshot only, capped at 10,000 products per merchant for this MVP. Pagination, delta imports, scheduled jobs, retries, variants, and multi-location inventory are intentionally deferred.

### Search

PostgreSQL maintains an English `tsvector` from product name and description, indexed with GIN. `websearch_to_tsquery` supports word matching, phrases and OR; relevance plus name and ID gives deterministic ordering. This is word-based search, not typo correction or substring matching. Price and stock filters run in SQL. Count and page are read from one repeatable-read snapshot so they stay consistent during sync.

### Boundaries

No NestJS, auth, checkout, payments, Shopify, WooCommerce, real merchant onboarding, public deployment, or external search service. The connection UI is for demo stores only. Do not expose this unauthenticated development app to the public internet. Connector responses are treated as untrusted data; only normalized validated values reach storage. No credentials belong in connection config in this milestone.

## Troubleshooting

- **Catalog setup screen / 503:** check `.env`, database health, and `npm run db:migrate`.
- **Sync fetch failed:** keep `npm run dev` or `npm run demo` running; check `DEMO_API_URL` and `DEMO_API_PORT` match. The previous catalog remains intact.
- **No products:** run `npm run db:setup`, then clear filters.
- **Port conflict:** change `DATABASE_URL` to match your PostgreSQL port. For the demo API, change both demo environment settings.

Next.js installation reference: https://nextjs.org/docs/app/getting-started/installation

### Source boundaries

`src/app` contains Next.js entry points and UI. `src/server` contains database access, commerce services, connectors, and server-side demo fixtures. `src/shared` contains browser-safe schemas, types, and options. Server Actions bridge interactive UI to commerce services; the same services remain callable from CLI scripts and integration tests. Folder names alone do not enforce runtime isolation. The boundary regression test checks local client/shared imports and allows client access to server code only through a `use server` action boundary.
