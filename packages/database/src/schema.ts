import { sql } from "drizzle-orm";
import { user } from "./auth-schema";
import { boolean, check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export type ConnectionConfig = { shop?: string };

export const merchants = pgTable(
  "merchants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    websiteUrl: text("website_url").notNull(),
    // The User who owns this store; null for stores connected before sign-in existed, claimed
    // when their owner reconnects the shop.
    userId: uuid("user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [index("merchants_user_idx").on(table.userId)],
);

export const merchantConnections = pgTable(
  "merchant_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: uuid("merchant_id")
      .notNull()
      .unique()
      .references(() => merchants.id, { onDelete: "cascade" }),
    connectorType: text("connector_type").$type<"shopify">().notNull(),
    config: jsonb("config").$type<ConnectionConfig>().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    lastError: text("last_error"),
    shopDomain: text("shop_domain").unique(),
    credentialsEncrypted: text("credentials_encrypted"),
    scopes: text("scopes"),
    tokenExpiresAt: timestamptz("token_expires_at"),
    refreshTokenExpiresAt: timestamptz("refresh_token_expires_at"),
    /** Shopify's own shop ID (`gid://shopify/Shop/…`), read when connecting. */
    shopGid: text("shop_gid"),
    /** When the shop last answered with the connection's token (set on connect). */
    verifiedAt: timestamptz("verified_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    check("merchant_connections_connector_type_check", sql`${table.connectorType} IN ('shopify')`),
  ],
);

export const oauthAttempts = pgTable("oauth_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  state: text("state").notNull().unique(),
  // The signed-in User connecting the shop. The Merchant is only claimed or created once
  // Shopify proves control of the shop, so nobody can reserve someone else's shop.
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  shop: text("shop").notNull(),
  browserBinding: text("browser_binding").notNull(),
  expiresAt: timestamptz("expires_at").notNull(),
  consumedAt: timestamptz("consumed_at"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

export type Merchant = typeof merchants.$inferSelect;
export type MerchantConnection = typeof merchantConnections.$inferSelect;
export type OAuthAttempt = typeof oauthAttempts.$inferSelect;

// Better Auth: users, their sessions and sign-in accounts, and the MCP OAuth server's state.
export * from "./auth-schema";
