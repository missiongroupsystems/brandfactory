-- Record which brand-context thread a run's report was landed in.
--
-- 3F has created that thread since it existed and returned its id to nobody, so
-- the only route back to a specific run's report was the *list* of every
-- conversation the brand has, with the user matching a date in a card title. The
-- report modal needs somewhere honest to send you afterwards, and "the list, work
-- it out" is not it.
--
-- `ON DELETE set null`, not cascade. Deleting the conversation must not delete
-- the job: the row is the only record that money was spent, and it still holds
-- the report itself. A stale pointer becoming null is the correct outcome.
--
-- **Nothing is backfilled, on purpose.** The thread's name is derived
-- (`Brand research — {brand}, {d MMM yyyy}`), so an UPDATE could match existing
-- rows on it — via `to_char(started_at AT TIME ZONE 'UTC', 'FMDD Mon YYYY')`,
-- whose month abbreviations depend on the deployment's `lc_time`. A locale-
-- dependent join that either silently matches nothing or links a run to the
-- wrong thread is a worse outcome than the null this column already handles:
-- every reader treats null as "offer the conversation list", which is a true
-- statement about where research threads live rather than a claim about which
-- one is this run's.
ALTER TABLE "brand_research_jobs" ADD COLUMN "report_project_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "brand_research_jobs" ADD CONSTRAINT "brand_research_jobs_report_project_id_projects_id_fk" FOREIGN KEY ("report_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
