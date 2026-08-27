CREATE TABLE IF NOT EXISTS "photo_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brand_assets" ADD COLUMN "category_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "photo_categories" ADD CONSTRAINT "photo_categories_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "photo_categories_brand_position_idx" ON "photo_categories" USING btree ("brand_id","position");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "brand_assets" ADD CONSTRAINT "brand_assets_category_id_photo_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."photo_categories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
