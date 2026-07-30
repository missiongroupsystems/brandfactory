-- Make the one-active-job-per-brand rule a constraint instead of a convention.
--
-- `hasActiveResearchJob` is a SELECT followed by an INSERT, and what fits in the
-- window between them is a second $0.40 vendor submission: two clicks inside one
-- HTTP round trip, neither request seeing the other's row, both passing the
-- guard, both submitting. Only the index sees both writes, so only the index can
-- settle it.
--
-- **The rows have to agree with the constraint before the constraint exists.**
-- The race this closes is exactly the thing that could have left a brand with two
-- IN_PROGRESS rows, and `CREATE UNIQUE INDEX` on that data fails — taking the
-- whole release with it. So the duplicates are resolved first, keeping the newest
-- per brand because that is the one the hub reads (`getLatestResearchJob` orders
-- by `created_at DESC`) and therefore the one a user is watching.
--
-- The losers are closed as FAILED rather than deleted: a row is the only record
-- that money was spent, `external_id` is the only pointer to a report that may
-- exist at the vendor, and the daily cap counts rows precisely so that a run
-- which was billed still counts. Deleting them would hide a real charge.
UPDATE "brand_research_jobs" AS j
SET
	"status" = 'FAILED',
	"completed_at" = now(),
	"error" = 'Closed by migration 0006: this brand had more than one run in flight, which the one-active-job-per-brand rule now prevents.'
WHERE
	j."status" = 'IN_PROGRESS'
	AND EXISTS (
		SELECT 1
		FROM "brand_research_jobs" AS newer
		WHERE
			newer."brand_id" = j."brand_id"
			AND newer."status" = 'IN_PROGRESS'
			AND (newer."created_at", newer."id") > (j."created_at", j."id")
	);--> statement-breakpoint
DROP INDEX IF EXISTS "brand_research_jobs_in_flight_idx";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "brand_research_jobs_in_flight_idx" ON "brand_research_jobs" USING btree ("brand_id") WHERE "brand_research_jobs"."status" = 'IN_PROGRESS';
