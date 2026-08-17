ALTER TABLE "brands" ADD COLUMN "passport_unit_id" uuid;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "passport_organization_id" uuid;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspaces_passport_organization_id_idx" ON "workspaces" USING btree ("passport_organization_id");--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_passport_unit_id_key" UNIQUE("passport_unit_id");