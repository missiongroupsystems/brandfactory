ALTER TABLE "brand_assets" ADD COLUMN "is_pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_assets" ADD COLUMN "pinned_at" timestamp with time zone;