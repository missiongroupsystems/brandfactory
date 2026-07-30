CREATE TYPE "public"."research_job_status" AS ENUM('IN_PROGRESS', 'COMPLETED', 'FAILED', 'NO_FINDINGS', 'CANCELLED');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "brand_research_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"status" "research_job_status" DEFAULT 'IN_PROGRESS' NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input" jsonb NOT NULL,
	"external_id" text,
	"report" text,
	"citations" jsonb,
	"drafts" jsonb,
	"error" text,
	"cost_usd" numeric(12, 6),
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "brand_research_jobs" ADD CONSTRAINT "brand_research_jobs_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brand_research_jobs_brand_created_idx" ON "brand_research_jobs" USING btree ("brand_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brand_research_jobs_in_flight_idx" ON "brand_research_jobs" USING btree ("brand_id") WHERE "brand_research_jobs"."status" = 'IN_PROGRESS';