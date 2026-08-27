CREATE TYPE "public"."deck_source" AS ENUM('pdf', 'canva');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deck_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deck_id" uuid NOT NULL,
	"source" "deck_source" NOT NULL,
	"label" text NOT NULL,
	"version_date" date NOT NULL,
	"author" text NOT NULL,
	"pdf_blob_key" text,
	"canva_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deck_versions_source_shape" CHECK ((
        ("deck_versions"."source" = 'pdf'   AND "deck_versions"."pdf_blob_key" IS NOT NULL AND "deck_versions"."canva_url" IS NULL) OR
        ("deck_versions"."source" = 'canva' AND "deck_versions"."canva_url"   IS NOT NULL AND "deck_versions"."pdf_blob_key" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "decks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deck_versions" ADD CONSTRAINT "deck_versions_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "decks" ADD CONSTRAINT "decks_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deck_versions_deck_date_idx" ON "deck_versions" USING btree ("deck_id","version_date" DESC NULLS LAST,"created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "decks_brand_name_idx" ON "decks" USING btree ("brand_id","name");