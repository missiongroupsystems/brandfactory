CREATE TYPE "public"."influencer_platform" AS ENUM('instagram', 'tiktok', 'youtube', 'xiaohongshu', 'facebook', 'linkedin');--> statement-breakpoint
CREATE TYPE "public"."influencer_status" AS ENUM('active', 'prospect', 'past');--> statement-breakpoint
CREATE TYPE "public"."influencer_vertical" AS ENUM('beauty', 'fashion', 'food', 'fitness', 'travel', 'home', 'tech', 'parenting', 'motoring', 'family');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "influencers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"handle" text NOT NULL,
	"platform" "influencer_platform" NOT NULL,
	"followers" integer NOT NULL,
	"engagement_rate" numeric(5, 2),
	"vertical" "influencer_vertical",
	"status" "influencer_status" DEFAULT 'prospect' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "influencers_workspace_slug_key" UNIQUE("workspace_id","slug"),
	CONSTRAINT "influencers_workspace_platform_handle_key" UNIQUE("workspace_id","platform","handle")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "influencer_brands" (
	"influencer_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	CONSTRAINT "influencer_brands_influencer_id_brand_id_pk" PRIMARY KEY("influencer_id","brand_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "influencers" ADD CONSTRAINT "influencers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "influencer_brands" ADD CONSTRAINT "influencer_brands_influencer_id_influencers_id_fk" FOREIGN KEY ("influencer_id") REFERENCES "public"."influencers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "influencer_brands" ADD CONSTRAINT "influencer_brands_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "influencers_workspace_followers_idx" ON "influencers" USING btree ("workspace_id","followers" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "influencer_brands_brand_idx" ON "influencer_brands" USING btree ("brand_id");