CREATE TYPE "public"."credential_audit_action" AS ENUM('set-on-create', 'reset', 'granted', 'revoked', 'role_changed', 'deactivated', 'reactivated');--> statement-breakpoint
CREATE TYPE "public"."workspace_role" AS ENUM('admin');--> statement-breakpoint
CREATE TYPE "public"."brand_role" AS ENUM('viewer', 'editor', 'manager');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credential_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_email" text,
	"subject_id" uuid,
	"subject_email" text,
	"action" "credential_audit_action" NOT NULL,
	"brand_id" uuid,
	"from_role" text,
	"to_role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"role" "brand_role" DEFAULT 'editor' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_brands_user_brand_key" UNIQUE("user_id","brand_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "workspace_role";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "must_set_password" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deactivated_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_brands" ADD CONSTRAINT "user_brands_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_brands" ADD CONSTRAINT "user_brands_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credential_audit_subject_idx" ON "credential_audit" USING btree ("subject_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credential_audit_created_idx" ON "credential_audit" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_brands_user_idx" ON "user_brands" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_brands_brand_idx" ON "user_brands" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_lower_idx" ON "users" USING btree (lower("email"));--> statement-breakpoint
-- ─── Backfill ────────────────────────────────────────────────────────────────
-- Hand-written. drizzle-kit cannot know that this migration has to leave every
-- existing person with exactly the access they have today, and that is the
-- whole reason it is safe to enforce these columns in a later phase.
--
-- Every current user becomes an admin with every brand. That is not a
-- judgement about any of them; it is today's behaviour written down. Narrowing
-- it is a data task for a person, after the screen exists.
UPDATE "users" SET "role" = 'admin' WHERE "role" IS NULL;--> statement-breakpoint

-- One grant per user per brand, at the highest degree, so that demoting
-- somebody out of `admin` later does not also silently take their brands away
-- in the same edit. Two separate decisions stay two separate decisions.
INSERT INTO "user_brands" ("user_id", "brand_id", "role")
SELECT u."id", b."id", 'manager'
FROM "users" u CROSS JOIN "brands" b
ON CONFLICT ON CONSTRAINT "user_brands_user_brand_key" DO NOTHING;--> statement-breakpoint

-- `must_set_password` needs no statement: the ADD COLUMN above carries
-- `DEFAULT true NOT NULL`, so every existing row already reads true. That is
-- deliberate. This app has never had a password screen, so nobody has chosen a
-- password through it, and each of the nine sets one at their next sign-in.
--
-- ⚠️ We do NOT ask GoTrue whether a password already exists. Reading
-- `auth.users.encrypted_password` reaches into a schema a GoTrue upgrade may
-- change with no notice, and the Admin API's `identities[]` does not settle it
-- either, because a magic-link sign-in also creates an `email` identity. The
-- default rests on a fact about our own code instead.
--
-- ⚠️ `users_email_lower_idx` above will ABORT this migration if two accounts
-- differ only in the case of their address. That is the correct outcome — on a
-- path that hands out a session, two such rows are a way to authenticate
-- somebody as the wrong person. Merge them by hand and run the migration again.
