-- An account becomes a row of its own: `influencer_accounts`.
--
-- ============================================================================
-- STATEMENT 3 IS HAND-WRITTEN AND `drizzle-kit generate` DOES NOT PRODUCE IT.
-- ============================================================================
-- It copies every existing creator's platform, handle, follower count and
-- engagement rate down into the new table before the four columns are dropped.
-- **Regenerating this file deletes that INSERT and the migration then destroys
-- every follower count in the database.** The generated statement order also put
-- the drops before the foreign keys; this file reorders them, so the diff against
-- a fresh `db:generate` is expected to be large.
--
-- The copy cannot violate `influencer_accounts_workspace_platform_handle_key`:
-- `(workspace_id, platform, handle)` was already unique on `influencers`, and it
-- is the same constraint one table lower. Every existing creator gets exactly one
-- account at position 0, which makes their total reach their old figure — so no
-- reach tier moves on the day this runs.
--
-- `url` is `NULL` for every copied row. Nothing derives a profile URL from a
-- handle: a wrong link to a real stranger's profile is worse than no link.

CREATE TABLE IF NOT EXISTS "influencer_accounts" (
	"influencer_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"platform" "influencer_platform" NOT NULL,
	"handle" text NOT NULL,
	"followers" integer NOT NULL,
	"engagement_rate" numeric(5, 2),
	"url" text,
	CONSTRAINT "influencer_accounts_influencer_id_position_pk" PRIMARY KEY("influencer_id","position"),
	CONSTRAINT "influencer_accounts_workspace_platform_handle_key" UNIQUE("workspace_id","platform","handle")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "influencer_accounts" ADD CONSTRAINT "influencer_accounts_influencer_id_influencers_id_fk" FOREIGN KEY ("influencer_id") REFERENCES "public"."influencers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "influencer_accounts" ADD CONSTRAINT "influencer_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
INSERT INTO "influencer_accounts" ("influencer_id", "workspace_id", "position", "platform", "handle", "followers", "engagement_rate", "url")
SELECT "id", "workspace_id", 0, "platform", "handle", "followers", "engagement_rate", NULL FROM "influencers";
--> statement-breakpoint
ALTER TABLE "influencers" DROP CONSTRAINT "influencers_workspace_platform_handle_key";--> statement-breakpoint
DROP INDEX IF EXISTS "influencers_workspace_followers_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "influencers_workspace_name_idx" ON "influencers" USING btree ("workspace_id","name");--> statement-breakpoint
ALTER TABLE "influencers" DROP COLUMN IF EXISTS "handle";--> statement-breakpoint
ALTER TABLE "influencers" DROP COLUMN IF EXISTS "platform";--> statement-breakpoint
ALTER TABLE "influencers" DROP COLUMN IF EXISTS "followers";--> statement-breakpoint
ALTER TABLE "influencers" DROP COLUMN IF EXISTS "engagement_rate";
