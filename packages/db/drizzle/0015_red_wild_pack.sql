CREATE TABLE IF NOT EXISTS "passport_write_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"payload" jsonb NOT NULL,
	"unit_id" uuid,
	"attempted_by" uuid NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"last_error" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "passport_write_attempts_org_idx" ON "passport_write_attempts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "passport_write_attempts_expires_at_idx" ON "passport_write_attempts" USING btree ("expires_at");