CREATE TABLE IF NOT EXISTS "passport_login_attempts" (
	"state" text PRIMARY KEY NOT NULL,
	"code_verifier" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "passport_login_attempts_expires_at_idx" ON "passport_login_attempts" USING btree ("expires_at");