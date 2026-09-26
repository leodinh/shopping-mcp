import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export type ConnectionConfig = { shop?: string };

export const merchants = pgTable("merchants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  websiteUrl: text("website_url").notNull(),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

export const merchantConnections = pgTable(
  "merchant_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: uuid("merchant_id")
      .notNull()
      .unique()
      .references(() => merchants.id, { onDelete: "cascade" }),
    connectorType: text("connector_type").notNull(),
    config: jsonb("config").$type<ConnectionConfig>().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    lastSyncedAt: timestamptz("last_synced_at"),
    lastAttemptAt: timestamptz("last_attempt_at"),
    lastError: text("last_error"),
    shopDomain: text("shop_domain").unique(),
    credentialsEncrypted: text("credentials_encrypted"),
    scopes: text("scopes"),
    tokenExpiresAt: timestamptz("token_expires_at"),
    refreshTokenExpiresAt: timestamptz("refresh_token_expires_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    check("merchant_connections_connector_type_check", sql`${table.connectorType} IN ('shopify')`),
  ],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    priceMinor: integer("price_minor").notNull(),
    currency: text("currency").notNull(),
    images: jsonb("images").$type<string[]>().notNull().default([]),
    inventory: integer("inventory").notNull(),
    productUrl: text("product_url").notNull(),
    active: boolean("active").notNull().default(true),
    searchDocument: tsvector("search_document").generatedAlwaysAs(
      sql`to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, ''))`,
    ),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique().on(table.merchantId, table.externalId),
    check("products_name_check", sql`length(${table.name}) > 0`),
    check("products_price_minor_check", sql`${table.priceMinor} >= 0`),
    check("products_currency_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check("products_images_check", sql`jsonb_typeof(${table.images}) = 'array'`),
    check("products_inventory_check", sql`${table.inventory} >= 0`),
    index("products_search_idx").using("gin", table.searchDocument).where(sql`${table.active}`),
    index("products_merchant_idx").on(table.merchantId).where(sql`${table.active}`),
    index("products_price_idx").on(table.currency, table.priceMinor).where(sql`${table.active}`),
  ],
);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  merchantId: uuid("merchant_id")
    .notNull()
    .references(() => merchants.id, { onDelete: "cascade" }),
  expiresAt: timestamptz("expires_at").notNull(),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

export const oauthAttempts = pgTable("oauth_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  state: text("state").notNull().unique(),
  merchantId: uuid("merchant_id")
    .notNull()
    .references(() => merchants.id, { onDelete: "cascade" }),
  shop: text("shop").notNull(),
  browserBinding: text("browser_binding").notNull(),
  expiresAt: timestamptz("expires_at").notNull(),
  consumedAt: timestamptz("consumed_at"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => merchantConnections.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    productCount: integer("product_count"),
    error: text("error"),
    startedAt: timestamptz("started_at"),
    finishedAt: timestamptz("finished_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    check("sync_runs_status_check", sql`${table.status} IN ('pending', 'running', 'succeeded', 'failed')`),
  ],
);

export type Merchant = typeof merchants.$inferSelect;
export type MerchantConnection = typeof merchantConnections.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type OAuthAttempt = typeof oauthAttempts.$inferSelect;
export type SyncRun = typeof syncRuns.$inferSelect;
