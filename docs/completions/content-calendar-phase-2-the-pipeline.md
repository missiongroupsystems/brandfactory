# Content calendar Phase 2 — `social_posts` becomes a production pipeline

**Shipped in:** unreleased. **Migration:** 0023, hand-edited. **Wire:** no new route; three
schemas widened. **New dependency:** none.

## What this phase is

Step 2 of `docs/executing/content-calendar-plan.md`: the data half of MKT-1. The table the
marketing team already writes into learns the five stages they named, the plan fields they asked
for, and the two links the calendar needs.

Deliberately **not** in this phase: the `GET /calendar/entries` route and any screen. The enum
rename touches every surface that renders a post, and doing that in one commit with the schema is
already the largest change the plan has. The workspace-level read is next.

## Widened, not replaced

`social_posts` already held brand, platform, a nullable `scheduled_at` (the unscheduled tray), a
`body` where `''` means *slot claimed, copy pending*, soft delete, attachments and provenance.
`funnel_activities.social_post_id` points at it (1.55.0). A new `content_items` table would have
orphaned that link and duplicated five routes to gain nothing the columns below could not carry.

| Added | Why |
|---|---|
| `status` → `idea, approved, filming, editing, posted` | The pipeline the workshop named. `draft → idea`, `ready → approved`. |
| `kind` → `post, shoot` | A shoot has its own date and crew and feeds posts scheduled separately. |
| `shoot_id` | Post → shoot, one way. `ON DELETE SET NULL`: deleting a shoot must not take the posts it fed. |
| `format, hook, dish, talent, filmed_by, canva_url, cleared_with` | The content plan, all free text. |
| `approved_at, approved_by` | Who cleared it, and when. Server-owned. |
| `events_event_id` | The Mission Events event, **no foreign key** — another app's database. |
| `social_platform` + `xiaohongshu`, `threads` | The roster has carried Xiaohongshu accounts since 1.47.0. |

## Free text, and why that is the decision

Talent is a chef one week, a floor team the next, a booked creator the week after. The freelancer
behind a camera may be a vendor row or a name in somebody's phone. Structure chosen now is a guess
about which, and the first wrong guess costs more than the typing does. A month of what the team
actually writes is the evidence for linking any of these to a real record, and nothing typed is
lost when that happens.

`''` and `null` both mean nobody filled it in, so `blankToNull` collapses the blank in the mapper
and no reader downstream tests for two empties.

## The migration is hand-edited, and had to be

`drizzle-kit` generated this for the status change:

```sql
ALTER TABLE social_posts ALTER COLUMN status SET DATA TYPE text;
DROP TYPE social_post_status;
CREATE TYPE social_post_status AS ENUM('idea', …);
ALTER TABLE social_posts ALTER COLUMN status SET DATA TYPE social_post_status USING status::social_post_status;
```

That cast rejects every row still holding `'draft'` or `'ready'` — which is every row the table
has. It also set the new default before the type that would accept it existed. 0023 therefore
drops the default first, maps the values with a `CASE` while the column is text, and restores the
default at the end. Generated for its number, corrected for its content.

## The approval stamp is written once

`APPROVED_OR_LATER` is the four stages past `idea`, not `approved` alone: a team plans a shoot it
has already agreed and creates the row straight into `filming`, and a stamp keyed to one value
would leave those unstamped and the unreviewed pile wrong.

The write is `coalesce(approved_at, now())`, so a post pushed back to `idea` and approved again
keeps its **first** approval. The question the pair answers is *did anybody ever clear this?*, and
a second answer to it would erase the first.

The approver is the session user, passed as an argument rather than read from the payload: a client
that could name its own approver could name anybody. `clearedWith` is the free-text companion —
approval today is anyone signed in, because the marketing team uses this tool alone and the people
they clear with are not on the platform. That field records the fact honestly instead of a role
column claiming an authority the product does not have.

## The pill is a ramp, not a traffic light

Five stages needed five treatments, and the feedback tints were available and wrong. `index.css`
already refused them once, where the key-date sets are defined: those colours mean error, warning,
success and information, and `Filming` is not a warning.

So the pill is one hue at increasing strength — grey, outline, outlined green, tinted, settled.
The steps differ in lightness rather than hue, so the ramp survives deuteranopia, and the word is
always beside it. Full Tailwind class strings, never composed: the same silent failure
`KEY_DATE_APPEARANCE` documents.

## Two tests that were quietly wrong

`'threads'` was the stand-in for *not a platform* in two rejection tests. It is a platform now, so
both asserted the opposite of what they were written to assert the moment the enum grew. They use
`'bereal'`, which the product has genuinely not adopted.

## The gate

`typecheck`, `lint`, `format:check`, `test`, and both builds, all clean. **3105 tests**, one more
than 1.55.0's 3104: the blank-collapsing rule in `rowToSocialPost` is new behaviour and earns the
assertion. 2940 passed, 165 skipped.

The live tests in `packages/db` still skip — they need `DATABASE_URL`, and **0023 has not been run
against a real database**. It should be applied to a copy of production before it is applied to
production, because the `CASE` is the part that matters and only real rows prove it.
