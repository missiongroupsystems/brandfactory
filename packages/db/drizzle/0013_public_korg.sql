CREATE TYPE "public"."outlet_status" AS ENUM('pipeline', 'fitting_out', 'open', 'temporarily_closed', 'closed');--> statement-breakpoint
CREATE TYPE "public"."outlet_type" AS ENUM('restaurant', 'bar', 'cafe', 'central_kitchen', 'office');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "outlets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"outlet_type" "outlet_type" NOT NULL,
	"status" "outlet_status" DEFAULT 'pipeline' NOT NULL,
	"address" text,
	"unit" text,
	"postal_code" text,
	"attributes" text[] DEFAULT '{}' NOT NULL,
	"target_opening_date" date,
	"opening_date" date,
	"closing_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outlets_workspace_slug_key" UNIQUE("workspace_id","slug")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "outlets" ADD CONSTRAINT "outlets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "outlets" ADD CONSTRAINT "outlets_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outlets_workspace_name_idx" ON "outlets" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outlets_brand_idx" ON "outlets" USING btree ("brand_id");