# Marketing funnel — Phases 4A to 4D

**Migration:** 0021 — four tables, one enum. **Wire:** one router, thirteen routes.
**New dependency:** none.

Shipped as one release: the stages are inert without platforms to name and activities to hold, and
none of the three is reachable without the screen.

## The six defaults are rows, written with the brand

*"Editable per brand"* means rows — a constant cannot be renamed. So `createBrand` writes the six
in **the same transaction** as the brand itself. A brand that committed without its stages would
show an empty funnel a reader cannot tell apart from *"nobody has set this up yet"*, and the second
one is a state they would act on.

This is the only cross-aggregate write in the four marketing features: Plan 4 reaching into the
brand create path, deliberately, because the alternative is a `GET` that writes.

**No backfill in the migration.** Migration 0010's `CASE` is not the precedent it looks like: that
one *derived* a value already implied by `kind` and `role`, and its own docstring calls even that
duplication "a real hazard". Six stage names in SQL derive nothing — they are product copy, written
a second time, in the one language that cannot import `DEFAULT_FUNNEL_STAGES`.

What covers brands that already exist is **the empty state's button**, which is also the honest
shape: the request calls the set editable, so a brand that wants five stages should not have to
delete a row the database gave it unasked. It is `suggested-categories.ts`' pattern — curated
starters *"without locking the taxonomy"*, offered rather than installed.

## A platform is a row, not a field on a stage

Instagram serves Awareness and it serves Loyalty. As a row belonging to one stage it would be typed
twice, its URL typed twice, and a correction applied to one of the two. That is the duplication
`vendor_brands` and `influencer_brands` were each built to avoid, and `stage_platforms` is that
argument a third time — composite primary key, both sides cascading, plus the reverse index the
primary key's own cannot serve.

**`social_platform` is not reused.** It is an eight-member *social* enum; a funnel names Google
Ads, email, SEO, a review site, the shop window. Reusing it would file three quarters of a brand's
funnel under `other`. Brand-scoped rows also settle the vocabulary question without a migration.

There is a route test for the whole point of this: one platform, two stages, **one row**.

## `platform_id` restricts rather than cascades

An activity whose platform vanished is an activity that ran nowhere. Platforms are cheap to keep,
and a cascade here would delete work records as a side effect of tidying a channel list. So the FK
is `ON DELETE RESTRICT` and the route answers **409 `PLATFORM_IN_USE`** with a sentence naming the
fix, rather than letting the screen guess.

## Two dates, and no CHECK tying them to status

The request says only "dates". Two, both nullable: a Planned activity often has neither, a Running
one has a start and no end, and a Done one has both. **One date cannot express the middle case**,
which is the state most activities are in when anybody looks.

No CHECK relating them to `status`. A Done activity with no end date is a record somebody has not
finished filling in, not a corrupt row — this screen is for planning, not bookkeeping.

## Status is a lifecycle, never a score

Four members, closed, and bounded away from performance by the request itself: *"not performance;
the deep platforms measure that."* Nothing on this screen renders a number about how anything did.

## The typed link is deferred, and the note carries it meanwhile

Of the three targets the request names, one is real but unreachable from this app (`social_posts`
renders only at :5173), one has no referent in the schema (there is no influencer *program*), and
one is a 647-line fixture whose own docstring says there is no server. The request permits the
fallback in as many words — *"otherwise it is plain text"* — so an activity's `note` is where a
reference goes until contracts becomes an aggregate. There is a test that says so.

## Two screen defects the tests caught

- **Every platform rendered twice per stage** — once as a header link, once as a remove button
  below. A five-platform stage read as ten. Now one chip carrying both the way out and the way off.
- **Status showed twice per activity** — a tone badge beside the select that already displays it.
  `AGENTS.md` settled that argument one screen over: one choice from a closed list is a control
  showing its own value, not a label plus a separate way to change it. The badge and its tone map
  are gone.

## The nav, and the end of `Tools`

The funnel is the last of the four brand-scoped features. Its workspace row goes, which empties the
`Tools` group — so the group goes too, and with it the last `Empty` tag in the product. The
mechanism stays: deleting the honesty machinery the moment it goes quiet is how the next
placeholder ships looking real.

`BRAND_NAV_ITEMS` is now six rows in three groups, which is what Phase 0 built the grouping for.
