CREATE TYPE "public"."social_post_created_by" AS ENUM('user', 'agent');--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN "created_by" "social_post_created_by" DEFAULT 'user' NOT NULL;