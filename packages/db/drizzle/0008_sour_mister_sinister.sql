-- Guideline auto-fill's spend ledger (decision 9): an append-only event per
-- filled section, NOT a `kind` column on `brand_research_jobs` — that table's
-- in-flight unique index and its readers all assume one row-kind, and the cap
-- this table serves only ever counts `source = 'search'` (vendor money; Path R
-- re-reads a report already paid for).
--
-- It also carries the provenance the section row refuses (decision 10 / Q3):
-- guideline sections stay {label, body, priority, createdBy}, so which model
-- wrote the text, what it cost and which sources it rests on are recorded here,
-- keyed by brand and time, without touching the guidelines wire.
CREATE TABLE IF NOT EXISTS "section_autofill_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"label" text NOT NULL,
	"source" text NOT NULL,
	"model" text NOT NULL,
	"cost_usd" numeric(12, 6),
	"sources" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "section_autofill_events" ADD CONSTRAINT "section_autofill_events_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "section_autofill_events_brand_created_idx" ON "section_autofill_events" USING btree ("brand_id","created_at" DESC NULLS LAST);