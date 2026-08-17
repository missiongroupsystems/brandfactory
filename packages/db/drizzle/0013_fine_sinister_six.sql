-- Mission Passport read model (the "projection").
--
-- Plan: docs/executing/passport-sync-consumer-plan.md, phase 2.
-- Doctrine + the reasoning behind every choice below: packages/db/src/schema/passport/schema.ts
--
-- These eight tables are written ONLY by the sync receiver and the nightly
-- reconciliation job. Nothing on a request path writes them. From phase 8 they
-- replace the local `workspaces` and `brands` tables outright -- they are this
-- app's org/brand/outlet/role model, not a cache beside one.
--
-- THREE THINGS THAT LOOK LIKE OMISSIONS AND ARE DECISIONS:
--
--   1. NO FOREIGN KEYS, and no constraint beyond the primary key. Sync events are
--      replay- and out-of-order-safe by contract, so a `unit.upserted` may
--      legitimately arrive before the `org.upserted` that would satisfy an FK. A
--      constraint would reject the event, the receiver would answer 500, and
--      Passport's delivery worker would retry it forever. Referential integrity is
--      Passport's job on the write side. This extends to UNIQUE: notably there is
--      deliberately none on identity_link (subject, app_id), even though our own
--      writer maintains that invariant.
--
--   2. NO SEPARATE DATABASE ROLE, so no REVOKE. The canonical guidance is to make
--      the replica read-only by privilege, and that guidance comes from consumers
--      where the BROWSER holds a Postgres connection through PostgREST. Here every
--      read and write goes through one server process as one role, so a REVOKE could
--      only exclude our own request path -- a developer mistake, caught earlier and
--      more legibly by packages/db/src/passport-write-guard.test.ts. The dedicated
--      schema is kept regardless: it makes foreign data obvious in every query, and
--      it is what a REVOKE would attach to the day one is warranted.
--
--   3. NO `passport.user` TABLE. `user.upserted` carries only fields
--      passport.membership already embeds (email, display_name), and the
--      reconciliation snapshot has no `users` collection -- so a mirror could drift
--      with nothing able to detect it.
--
-- `status = 'removed'` on membership and unit_app_membership is a TOMBSTONE, never
-- a delete: those events carry the final aggregate. Deleting the row instead makes
-- nightly reconciliation resurrect it from the snapshot, which reads as a revoked
-- user silently regaining access.

CREATE SCHEMA "passport";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "passport"."entitlement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"status" text NOT NULL,
	"tier" text,
	"source" text NOT NULL,
	"version" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "passport"."identity_link" (
	"id" uuid PRIMARY KEY NOT NULL,
	"platform_user_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"linked_via" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "passport"."membership" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"platform_user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"status" text NOT NULL,
	"version" integer NOT NULL,
	"email" text NOT NULL,
	"display_name" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "passport"."organization" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" text NOT NULL,
	"version" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "passport"."unit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"external_ref" text,
	"status" text NOT NULL,
	"version" integer NOT NULL,
	"uen" text,
	"gst_reg_no" text,
	"registered_address" text,
	"address" text,
	"postal" text,
	"contact_phone" text,
	"kind" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "passport"."unit_app_access" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"app_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "passport"."unit_app_membership" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"platform_user_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"role" text NOT NULL,
	"status" text NOT NULL,
	"version" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "passport"."unit_relation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"from_unit_id" uuid NOT NULL,
	"to_unit_id" uuid NOT NULL,
	"relation" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "passport_entitlement_org_idx" ON "passport"."entitlement" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "passport_identity_link_subject_idx" ON "passport"."identity_link" USING btree ("subject","platform_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "passport_identity_link_platform_user_idx" ON "passport"."identity_link" USING btree ("platform_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "passport_membership_platform_user_idx" ON "passport"."membership" USING btree ("platform_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "passport_membership_org_idx" ON "passport"."membership" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "passport_membership_email_idx" ON "passport"."membership" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "passport_organization_slug_idx" ON "passport"."organization" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "passport_unit_org_idx" ON "passport"."unit" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "passport_unit_type_idx" ON "passport"."unit" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "passport_unit_app_access_unit_idx" ON "passport"."unit_app_access" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "passport_unit_app_access_org_idx" ON "passport"."unit_app_access" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "passport_unit_app_membership_platform_user_idx" ON "passport"."unit_app_membership" USING btree ("platform_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "passport_unit_app_membership_unit_idx" ON "passport"."unit_app_membership" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "passport_unit_app_membership_org_idx" ON "passport"."unit_app_membership" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "passport_unit_relation_from_idx" ON "passport"."unit_relation" USING btree ("from_unit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "passport_unit_relation_to_idx" ON "passport"."unit_relation" USING btree ("to_unit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "passport_unit_relation_org_idx" ON "passport"."unit_relation" USING btree ("organization_id");