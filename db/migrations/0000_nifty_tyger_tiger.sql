CREATE TABLE "merchant_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"connector_type" text NOT NULL,
	"config" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"last_error" text,
	"shop_domain" text,
	"credentials_encrypted" text,
	"scopes" text,
	"token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_connections_merchant_id_unique" UNIQUE("merchant_id"),
	CONSTRAINT "merchant_connections_shop_domain_unique" UNIQUE("shop_domain"),
	CONSTRAINT "merchant_connections_connector_type_check" CHECK ("merchant_connections"."connector_type" IN ('shopify'))
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"website_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "oauth_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state" text NOT NULL,
	"merchant_id" uuid NOT NULL,
	"shop" text NOT NULL,
	"browser_binding" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_attempts_state_unique" UNIQUE("state")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"inventory" integer NOT NULL,
	"product_url" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"search_document" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, ''))) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_merchant_id_external_id_unique" UNIQUE("merchant_id","external_id"),
	CONSTRAINT "products_name_check" CHECK (length("products"."name") > 0),
	CONSTRAINT "products_price_minor_check" CHECK ("products"."price_minor" >= 0),
	CONSTRAINT "products_currency_check" CHECK ("products"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "products_images_check" CHECK (jsonb_typeof("products"."images") = 'array'),
	CONSTRAINT "products_inventory_check" CHECK ("products"."inventory" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"status" text NOT NULL,
	"product_count" integer,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_runs_status_check" CHECK ("sync_runs"."status" IN ('pending', 'running', 'succeeded', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "merchant_connections" ADD CONSTRAINT "merchant_connections_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_attempts" ADD CONSTRAINT "oauth_attempts_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_connection_id_merchant_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."merchant_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_search_idx" ON "products" USING gin ("search_document") WHERE "products"."active";--> statement-breakpoint
CREATE INDEX "products_merchant_idx" ON "products" USING btree ("merchant_id") WHERE "products"."active";--> statement-breakpoint
CREATE INDEX "products_price_idx" ON "products" USING btree ("currency","price_minor") WHERE "products"."active";