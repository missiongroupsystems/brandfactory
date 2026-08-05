CREATE TYPE "public"."asset_library" AS ENUM('identity', 'photography', 'collateral');--> statement-breakpoint
--
-- Hand-authored, and the shape matters. `drizzle-kit generate` emitted
--
--     ALTER TABLE "brand_assets" ADD COLUMN "library" "asset_library" NOT NULL;
--
-- as one statement, which aborts on any table that already has rows: there is
-- no DEFAULT to fill them with. Adding one is not the fix either — a DB default
-- would be a fourth home for a rule that lives in `defaultLibraryFor` and in
-- the CASE below, and it would be wrong for two of the three shelves.
--
-- So: add it nullable, fill it, then tighten. The column is never briefly
-- NOT NULL and empty, and it is NOT NULL by the end of this migration.
--
ALTER TABLE "brand_assets" ADD COLUMN "library" "asset_library";--> statement-breakpoint
--
-- The backfill, mirroring `defaultLibraryFor` in
-- `packages/shared/src/asset/library.ts`. The two must agree **at the moment
-- this runs**, after which they are free to diverge harmlessly — this CASE
-- never executes again. `brand-assets.live.test.ts` runs this exact expression
-- against rows inserted with the column unset and compares it to the TypeScript.
--
-- **The role branch must precede the kind branch.** The two orderings differ
-- only in that the wrong one files every brand mark in the table as a
-- photograph — the most visible row there is, and the one nobody would check.
--
UPDATE "brand_assets" SET "library" = CASE
  WHEN "kind" = 'color'            THEN 'identity'
  WHEN "role" IN ('logo', 'mark')  THEN 'identity'
  WHEN "kind" = 'image'            THEN 'photography'
  ELSE 'collateral'
END::"asset_library";--> statement-breakpoint
ALTER TABLE "brand_assets" ALTER COLUMN "library" SET NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brand_assets_brand_library_position_active_idx" ON "brand_assets" USING btree ("brand_id","library","position") WHERE "brand_assets"."deleted_at" IS NULL;
