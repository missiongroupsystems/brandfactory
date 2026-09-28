CREATE TYPE "public"."social_post_kind" AS ENUM('post', 'shoot');--> statement-breakpoint
ALTER TYPE "public"."social_platform" ADD VALUE 'xiaohongshu' BEFORE 'linkedin';--> statement-breakpoint
ALTER TYPE "public"."social_platform" ADD VALUE 'threads' BEFORE 'pinterest';--> statement-breakpoint
ALTER TABLE "social_posts" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN "kind" "social_post_kind" DEFAULT 'post' NOT NULL;--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN "format" text;--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN "hook" text;--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN "dish" text;--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN "talent" text;--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN "filmed_by" text;--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN "canva_url" text;--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN "cleared_with" text;--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN "shoot_id" uuid;--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN "events_event_id" uuid;--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_shoot_id_social_posts_id_fk" FOREIGN KEY ("shoot_id") REFERENCES "public"."social_posts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- status: draft | ready | posted  ->  idea | approved | filming | editing | posted
--
-- Hand-edited, and it has to be. drizzle-kit drops the type and casts the
-- column straight back, which rejects every row still holding 'draft' or
-- 'ready' -- that is every row this table has. The column is mapped while it
-- is text, between the two casts, and the default is restored at the end
-- because it could not survive the type it named being dropped.
ALTER TABLE "public"."social_posts" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."social_post_status";--> statement-breakpoint
CREATE TYPE "public"."social_post_status" AS ENUM('idea', 'approved', 'filming', 'editing', 'posted');--> statement-breakpoint
UPDATE "social_posts" SET "status" = CASE "status" WHEN 'draft' THEN 'idea' WHEN 'ready' THEN 'approved' ELSE "status" END;--> statement-breakpoint
ALTER TABLE "public"."social_posts" ALTER COLUMN "status" SET DATA TYPE "public"."social_post_status" USING "status"::"public"."social_post_status";--> statement-breakpoint
ALTER TABLE "social_posts" ALTER COLUMN "status" SET DEFAULT 'idea';