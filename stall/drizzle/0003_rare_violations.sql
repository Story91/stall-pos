ALTER TABLE "payouts" ADD COLUMN "paypal_batch_id" text;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_paypal_batch_id_unique" UNIQUE("paypal_batch_id");