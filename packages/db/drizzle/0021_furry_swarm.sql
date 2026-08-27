CREATE TYPE "public"."funnel_activity_status" AS ENUM('planned', 'running', 'paused', 'done');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "funnel_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stage_id" uuid NOT NULL,
	"platform_id" uuid,
	"title" text NOT NULL,
	"status" "funnel_activity_status" DEFAULT 'planned' NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "funnel_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platforms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stage_platforms" (
	"stage_id" uuid NOT NULL,
	"platform_id" uuid NOT NULL,
	CONSTRAINT "stage_platforms_stage_id_platform_id_pk" PRIMARY KEY("stage_id","platform_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "funnel_activities" ADD CONSTRAINT "funnel_activities_stage_id_funnel_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."funnel_stages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "funnel_activities" ADD CONSTRAINT "funnel_activities_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "funnel_stages" ADD CONSTRAINT "funnel_stages_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platforms" ADD CONSTRAINT "platforms_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stage_platforms" ADD CONSTRAINT "stage_platforms_stage_id_funnel_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."funnel_stages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stage_platforms" ADD CONSTRAINT "stage_platforms_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "funnel_activities_stage_idx" ON "funnel_activities" USING btree ("stage_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "funnel_stages_brand_position_idx" ON "funnel_stages" USING btree ("brand_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platforms_brand_name_idx" ON "platforms" USING btree ("brand_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stage_platforms_platform_idx" ON "stage_platforms" USING btree ("platform_id");