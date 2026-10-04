CREATE TYPE "public"."marketing_request_priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."marketing_request_status" AS ENUM('new', 'in_review', 'resolved', 'declined');--> statement-breakpoint
CREATE TYPE "public"."marketing_request_type" AS ENUM('social_post', 'email_campaign', 'print_collateral', 'in_store_signage', 'photography_video', 'event_activation', 'website_update', 'other');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "marketing_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"outlet_id" uuid,
	"number" integer NOT NULL,
	"type" "marketing_request_type" NOT NULL,
	"priority" "marketing_request_priority" DEFAULT 'medium' NOT NULL,
	"status" "marketing_request_status" DEFAULT 'new' NOT NULL,
	"summary" text NOT NULL,
	"details" text,
	"needed_by" date,
	"requested_by_user_id" uuid,
	"assignee_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "marketing_requests_workspace_number_key" UNIQUE("workspace_id","number")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "marketing_requests" ADD CONSTRAINT "marketing_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "marketing_requests" ADD CONSTRAINT "marketing_requests_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "marketing_requests" ADD CONSTRAINT "marketing_requests_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "marketing_requests" ADD CONSTRAINT "marketing_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "marketing_requests" ADD CONSTRAINT "marketing_requests_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketing_requests_workspace_created_idx" ON "marketing_requests" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketing_requests_brand_idx" ON "marketing_requests" USING btree ("brand_id");