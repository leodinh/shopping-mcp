ALTER TABLE "oauth_attempts" DROP CONSTRAINT "oauth_attempts_merchant_id_merchants_id_fk";
--> statement-breakpoint
ALTER TABLE "oauth_attempts" DROP COLUMN "merchant_id";