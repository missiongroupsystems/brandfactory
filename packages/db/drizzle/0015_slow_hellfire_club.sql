CREATE TYPE "public"."vendor_category" AS ENUM('creative_agency', 'media_agency', 'talent_agency', 'pr_agency', 'production', 'events', 'research', 'software', 'freelancer', 'other');--> statement-breakpoint
CREATE TYPE "public"."vendor_status" AS ENUM('active', 'inactive', 'blacklisted');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" "vendor_category",
	"status" "vendor_status" DEFAULT 'active' NOT NULL,
	"uen" text,
	"website" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendors_workspace_slug_key" UNIQUE("workspace_id","slug"),
	CONSTRAINT "vendors_workspace_uen_key" UNIQUE("workspace_id","uen")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor_brands" (
	"vendor_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	CONSTRAINT "vendor_brands_vendor_id_brand_id_pk" PRIMARY KEY("vendor_id","brand_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor_contacts" (
	"vendor_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"email" text,
	"phone" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "vendor_contacts_vendor_id_position_pk" PRIMARY KEY("vendor_id","position")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendors" ADD CONSTRAINT "vendors_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_brands" ADD CONSTRAINT "vendor_brands_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_brands" ADD CONSTRAINT "vendor_brands_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_contacts" ADD CONSTRAINT "vendor_contacts_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendors_workspace_name_idx" ON "vendors" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendor_brands_brand_idx" ON "vendor_brands" USING btree ("brand_id");