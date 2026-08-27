CREATE TYPE "public"."resource_type" AS ENUM('font', 'image', 'icon', 'tool', 'reference', 'other');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "brand_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"type" "resource_type" NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "brand_resources" ADD CONSTRAINT "brand_resources_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brand_resources_brand_type_idx" ON "brand_resources" USING btree ("brand_id","type");