CREATE TYPE "public"."social_platform" AS ENUM('instagram', 'facebook', 'tiktok', 'linkedin', 'x', 'youtube', 'pinterest', 'other');--> statement-breakpoint
CREATE TYPE "public"."social_post_status" AS ENUM('draft', 'ready', 'posted');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_post_assets" (
	"post_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "social_post_assets_post_id_asset_id_pk" PRIMARY KEY("post_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"platform" "social_platform" NOT NULL,
	"scheduled_at" timestamp with time zone,
	"body" text DEFAULT '' NOT NULL,
	"status" "social_post_status" DEFAULT 'draft' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_post_assets" ADD CONSTRAINT "social_post_assets_post_id_social_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."social_posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_post_assets" ADD CONSTRAINT "social_post_assets_asset_id_brand_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."brand_assets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_post_assets_asset_idx" ON "social_post_assets" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_posts_brand_scheduled_active_idx" ON "social_posts" USING btree ("brand_id","scheduled_at") WHERE "social_posts"."deleted_at" IS NULL;