ALTER TABLE "funnel_activities" ADD COLUMN "social_post_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "funnel_activities" ADD CONSTRAINT "funnel_activities_social_post_id_social_posts_id_fk" FOREIGN KEY ("social_post_id") REFERENCES "public"."social_posts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
