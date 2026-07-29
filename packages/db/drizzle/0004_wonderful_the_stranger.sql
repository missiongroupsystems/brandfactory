CREATE TYPE "public"."asset_kind" AS ENUM('color', 'image', 'file');--> statement-breakpoint
CREATE TYPE "public"."asset_role" AS ENUM('logo', 'mark', 'primary');--> statement-breakpoint
CREATE TYPE "public"."asset_source" AS ENUM('inline', 'blob', 'link');--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM('proposed', 'active');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "brand_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"source" "asset_source" NOT NULL,
	"role" "asset_role",
	"status" "asset_status" DEFAULT 'active' NOT NULL,
	"label" text NOT NULL,
	"value" text,
	"blob_key" text,
	"url" text,
	"alt" text,
	"mime" text,
	"filename" text,
	"width" integer,
	"height" integer,
	"size_bytes" integer,
	"position" integer NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_assets_source_exactly_one" CHECK ((
    ("brand_assets"."source" = 'inline' AND "brand_assets"."value" IS NOT NULL AND "brand_assets"."blob_key" IS NULL AND "brand_assets"."url" IS NULL) OR
    ("brand_assets"."source" = 'blob' AND "brand_assets"."blob_key" IS NOT NULL AND "brand_assets"."value" IS NULL AND "brand_assets"."url" IS NULL) OR
    ("brand_assets"."source" = 'link' AND "brand_assets"."url" IS NOT NULL AND "brand_assets"."value" IS NULL AND "brand_assets"."blob_key" IS NULL)
  ))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "brand_assets" ADD CONSTRAINT "brand_assets_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brand_assets_brand_kind_position_active_idx" ON "brand_assets" USING btree ("brand_id","kind","position") WHERE "brand_assets"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brand_assets_brand_role_active_idx" ON "brand_assets" USING btree ("brand_id","role") WHERE "brand_assets"."deleted_at" IS NULL AND "brand_assets"."status" = 'active';