# Schema-first Drizzle for `src/server`

Date: 2026-09-12

## Goal

Make the TypeScript Drizzle schema the source of truth for tables, types, and future SQL. Replace the hand-written migration runner and delete scattered `*.entity.ts` files. Query with the Drizzle builder; keep `sql` fragments only where PostgreSQL has no builder equivalent.

## Out of scope

- Changing HTTP/MCP behavior, auth cookies, Shopify OAuth, or sync semantics
- Flattening domain folders into `repositories/` / `services/`
- Adding `postgres.js`, Prisma, or `drizzle-kit push`
- Rewriting `src/shared` catalog validation
- Public auth / multi-tenant isolation work

## Architecture

`src/server/db/schema.ts` declares every table. `drizzle-kit generate` diffs that file into `db/migrations`. `scripts/migrate.ts` applies those files through Drizzle’s migrator. Domain modules keep their current folders and import tables from the schema.

```text
Next.js / MCP / sync CLI
        │
        ▼
  catalog / merchants / auth / shopify / sync     (query builder)
        │
        ▼
  src/server/db/client.ts  →  drizzle(node-postgres Pool)
        │
        ▼
  PostgreSQL  ←  db/migrations (drizzle-kit SQL + snapshots)
```

## Folder layout

Keep domain folders. Move table types into one schema file. Generate one initial migration and apply it to an empty PostgreSQL database.

```text
src/server/
  db/
    client.ts          # Pool + drizzle instance
    schema.ts          # all pgTable definitions
  catalog/repository.ts
  merchants/repository.ts, service.ts, merchant-status.ts
  auth/session.ts
  shopify/             # connect, callback, credentials, hmac
  sync/service.ts
  connectors/
  mcp/
drizzle.config.ts
db/migrations/         # drizzle-kit output only
scripts/migrate.ts     # drizzle migrator
```

Delete:

- `src/server/catalog/product.entity.ts`
- `src/server/merchants/merchant.entity.ts`
- `src/server/merchants/merchant-connection.entity.ts`
- `src/server/auth/session.entity.ts`
- `src/server/shopify/oauth-attempt.entity.ts`
- `src/server/sync/sync-run.entity.ts`
- `db/migrations/001_commerce.sql` … `006_drop_demo.sql`

`MerchantStatus` and `CatalogProduct` stay. They are read models, not tables.

## Database client

Keep the existing `pg` Pool (max 10, timeouts unchanged). Wrap it:

```ts
export function pool(): Pool { /* current singleton */ }

export function database() {
  return drizzle({ client: pool(), schema });
}
```

Functions that talk to Postgres take `ReturnType<typeof database>` (or a transaction) instead of `Pool`. Tests that need a private schema build `drizzle({ client: isolatedPool, schema })`.

Do not use the global `casing: 'snake_case'` option. Every column sets its SQL name explicitly (`uuid('merchant_id')`) so generated SQL matches the live database.

## Schema

One file, six tables, names and constraints matching the current database after migrations `001`–`006`.

| Table | Purpose |
| --- | --- |
| `merchants` | Store identity |
| `merchant_connections` | Shopify integration (1:1 with merchant) |
| `products` | Normalized catalog; unique `(merchant_id, external_id)` |
| `sessions` | Seller dashboard cookie |
| `oauth_attempts` | One-time Shopify OAuth start |
| `sync_runs` | Import attempt row |

Required details that must not be dropped:

- `products.search_document` is `tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(name,'') || ' ' || coalesce(description,''))) STORED`
- GIN index on `search_document` where `active`
- Partial indexes on `products(merchant_id)` and `products(currency, price_minor)` where `active`
- `merchant_connections.connector_type` check is `IN ('shopify')` only
- `merchant_connections.shop_domain` unique; credentials live in `credentials_encrypted`, not `config`
- Money is `integer` minor units; inventory `>= 0`; currency `^[A-Z]{3}$`
- `images` is jsonb array
- UUIDs default `gen_random_uuid()`
- Foreign keys `ON DELETE CASCADE`

Row types come from the schema: `typeof merchants.$inferSelect`, `typeof merchantConnections.$inferInsert`, and so on. Do not re-declare those shapes in domain files.

`MerchantConnection` today omits Shopify columns. The schema includes `shopDomain`, `credentialsEncrypted`, `scopes`, `tokenExpiresAt`, `refreshTokenExpiresAt`. Queries select only the columns they need.

## Query conversion

Prefer the query builder. Allowed `sql` / `db.execute` uses:

1. Full-text operators: `websearch_to_tsquery`, `@@`, `ts_rank`
2. Advisory locks: `pg_try_advisory_lock(hashtextextended(...))` and unlock

Everything else uses `select` / `insert` / `update` / `onConflictDoUpdate` / `transaction`.

Catalog search:

- `innerJoin` products → merchants
- nested `merchant: { id, name, slug }` in the select list (no `json_build_object`)
- `db.transaction(..., { isolationLevel: 'repeatable read', accessMode: 'read only' })` for the count + page pair
- `and` / `or` / `eq` / `lte` / `gt` / `isNull` for filters; `sql` only for the tsquery fragment

Sync:

- lock via `execute`
- `select` the connection
- `insert(products).onConflictDoUpdate` on `(merchantId, externalId)`
- `update` to deactivate missing `externalId`s
- `update` connection timestamps / errors
- unlock in `finally`

Merchant dashboard status: `leftJoin` + `count(products.id)` + `groupBy(merchants.id, merchantConnections.id)`.

OAuth consume: `update(oauthAttempts).set({ consumedAt: new Date() }).where(...).returning()`.

Session create: `insert(sessions).values(...).returning({ id: sessions.id })`.

Pass a transaction object into helpers that currently accept `Pool | PoolClient` (`createSession`, `upsertConnection`, `consumeAttempt`).

HTTP status codes and error messages stay as they are (400 / 401 / 403 / 409 / 503).

## Migrations

Root `drizzle.config.ts`:

- `dialect: 'postgresql'`
- `schema: './src/server/db/schema.ts'`
- `out: './db/migrations'`
- `dbCredentials.url` from `DATABASE_URL`

Hand-write `schema.ts` for the six tables. Then `drizzle-kit generate` once to produce the initial SQL + `meta/_journal.json` snapshot.

`scripts/migrate.ts` connects with a **single** `pg.Client` (not the app Pool) and runs `migrate()` from `drizzle-orm/node-postgres/migrator`.

Apply the initial migration to an empty PostgreSQL database (`dropdb` / `createdb`, then `npm run db:migrate`).

New schema changes: edit `schema.ts`, run `npm run db:generate`, run `npm run db:migrate`. Never edit generated SQL by hand except to fix a drizzle-kit bug, and then update the snapshot in the same change.

## Scripts and docs

| Script | Command |
| --- | --- |
| `db:migrate` | `tsx --env-file-if-exists=.env scripts/migrate.ts` |
| `db:setup` | same as `db:migrate` |
| `db:generate` | `drizzle-kit generate` |

README architecture: table shapes live in `src/server/db/schema.ts`, not `*.entity.ts`. Migrations are drizzle-kit SQL.

## Dependencies

Add `drizzle-orm` and `drizzle-kit` (dev). Keep `pg` / `@types/pg`. Do not add `postgres`, `dotenv` (tsx already loads `.env`), or a second HTTP/database client.

## Testing

Contract tests (`tests/*.test.ts`) stay database-free. Update imports if entity paths disappear (they should not be imported today except in server modules).

Integration:

- `tests/integration/shopify-connect.test.ts` currently applies `001`–`006` into an isolated schema. Change `applyMigrations` to execute the generated drizzle `.sql` files in journal order against that `search_path`.
- `tests/integration/commerce.test.ts` keeps using the migrated shared database. Fixture insert/delete and assertions go through the same drizzle instance as production code. Behavior under test stays the same (stable product ids, FTS, in-stock filter, advisory lock, empty snapshot deactivates).
- Functions under test take a drizzle instance built from the test pool.

Run `npm test`, `npm run typecheck`, and `npm run test:integration` after the conversion. Search, sync, connect, and callback behavior must match today’s tests.

## Error handling

Unchanged at the HTTP boundary. Database unavailability still surfaces as 503 without leaking SQL. Invalid filters still 400 from Zod. Shopify HMAC/state failures still 403; shop already connected still 409.

Drizzle query failures are treated like today’s `pg` failures: catch at the route/handler, log, return the existing status.

## Rollout

1. Define the tables in `schema.ts`.
2. Remove the old SQL migration files and handwritten entity types.
3. Generate a fresh initial migration with Drizzle.
4. Apply it to an empty PostgreSQL database.
5. Convert queries and mutations module by module (auth → merchants → shopify → catalog → sync). `sql` only for full-text operators and advisory locks. `syncConnection` checks out one Pool client for the lock lifetime, then runs Drizzle on that client.
6. Run tests, typechecking, and a production build.

A brand-new database must reach the current schema from drizzle SQL alone.
