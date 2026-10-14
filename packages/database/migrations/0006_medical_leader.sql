DROP TABLE "products" CASCADE;--> statement-breakpoint
DROP TABLE "sync_runs" CASCADE;--> statement-breakpoint
ALTER TABLE "merchant_connections" DROP COLUMN "last_synced_at";--> statement-breakpoint
ALTER TABLE "merchant_connections" DROP COLUMN "last_attempt_at";