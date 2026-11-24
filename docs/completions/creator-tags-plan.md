# Creator tags: plan

Read `creator-tags-proposal.md` first (both now in `docs/completions/`). Branch `feat/creator-tags`, from `feat/creators-list`
(PR #47). Pack brandbase 1.21.0, migration `0031_influencer_tags.sql`. Completion document:
`docs/completions/creator-tags-phases-1-to-1.md`.

## Phase 1 (one phase)

1. **Pack 1.21.0**, additive. On `brandbase.influencers`:
   - `tags_team text[]`: tags people added, in the order added (at most 20).
   - `tags_ai text[]`: the model's last tags, less any a person removed (at most 6).
   - `tags_hidden text[]`: tags a person removed; the model never gives them again (at most 100).
   - `tags_source text`: a hash of the category, notes and bio the model last tagged.
   - `tagged_at`: the model's last try, good or bad. `bio`, `bio_read_at`: the Instagram bio.
   - `brandbase.tag_of(text)`: one spelling for a tag (no `#`, lower case, single spaces);
     `brandbase.influencer_tag_source(...)`; `influencer_json` gains `tags`
     (`tags_team`, then `tags_ai` not in it), so `influencer.list` and `.read` answer them.
2. **Moves.** `influencer.tag_add` and `influencer.tag_drop` (any member of the creator's company;
   a removal hides the tag from the model; an add takes it out of hidden). Internal only:
   `influencer.tag_due` (who to tag next), `influencer.bio_set`, `influencer.tag_set` (stores the
   model's tags, never one a person removed, at most six). A tag edit leaves `updated_at`, so it
   starts no new model call.
3. **Due rule.** A creator is due when their Instagram bio can be read and was not read for 30
   days, or when the hash of category, notes and bio differs from `tags_source` and the last try is
   older than the last edit, the last bio read or six hours (so a bad answer is not retried in a
   loop).
4. **The job** (`packages/connect/src/brandbase/creator-tags.ts`), started in `host.ts` only when
   `TAGS_OPENROUTER_API_KEY` is set and a principal is named (`TAGS_AS`, else `META_WEBHOOK_AS`).
   Every 5 minutes, at most 5 creators, 2 s apart, one run at a time: the bio through Business
   Discovery from an Instagram account of the creator's own company, then one OpenRouter call.
   Daily USD cap from `usage.cost` (`TAGS_DAILY_USD`, default 1), a hold per call until the cost
   arrives, 30 s timeout, `provider.data_collection: deny`, JSON answer checked and cut to six
   valid tags. The log holds counts only.
5. **Web.** `RosterPerson.tags`; chips with remove and an add field in the sidebar; the search
   matches tags; routes `POST /roster/:id/tags` and `DELETE /roster/:id/tags/:tag`; demo roster
   tags.
6. **Tests.** Pack tests (migration, moves, walls, a person's edit against the model's set);
   connect tests with a fake OpenRouter (key off, cap, malformed answer, person's edits kept, only
   the allowed fields sent, internal moves refused at the door); web tests (chips, add, remove,
   search by tag).
7. Playwright at 1440 px and iPhone 15 on the demo; full gate; adversarial review; changelog.

## Release (the owner)

1. Merge, then the Production workflow's `release` task with version 1.21.0, then `deploy`.
2. `agent-loadout` with ops `influencer.tag_due influencer.bio_set influencer.tag_set influencer.list brand.list account.meta_list`
   if the job runs as the webhook's agent (`META_WEBHOOK_AS`).
3. `fly secrets set -a brandfactory TAGS_OPENROUTER_API_KEY=...` (a key with its own credit limit
   on OpenRouter). Optional: `TAGS_DAILY_USD`, `TAGS_MODEL`, `TAGS_AS`.
