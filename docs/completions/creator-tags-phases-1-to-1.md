# Creator tags: phases 1 to 1

Proposal: `creator-tags-proposal.md`. Plan: `creator-tags-plan.md`. Branch `feat/creator-tags`,
release 2.77.0, pack brandbase 1.21.0, migration `0031_influencer_tags.sql`.

## Phase 1

### What changed

- **Pack 1.21.0** (additive). `brandbase.influencers` gains `tags_team` (people's, at most 20),
  `tags_ai` (the model's, at most 6), `tags_hidden` (removed by a person, at most 100, oldest
  dropped), `tags_source` (an md5 of category, notes and bio that the model last tagged),
  `tagged_at`, `bio` and `bio_read_at`. Functions `tag_of` (one spelling), `tag_ok` (1 to 30
  characters of `a-z 0-9`, with space, `&`, `'` and `-` between), `influencer_tag_source`,
  `influencer_tags` (team first, then the model's). `influencer_json` gains `tags`, so
  `influencer.list` and `influencer.read` answer them.
- **Moves.** `influencer.tag_add` and `influencer.tag_drop`, for every member of the creator's
  company (rules `influencer.found`, `influencer.tag_valid`, and `influencer.tag_room` for add). A
  drop hides the tag from the model; an add takes it out of hidden and out of the model's list,
  so it becomes the team's own. Neither touches `updated_at`, so a tag edit starts no model call.
  Internal: `influencer.tag_due`, `influencer.bio_set`, `influencer.tag_set`. `tag_set` stores
  only valid tags, never one a person removed or added, at most six; null tags record a failed
  try only.
- **Due rule** (`tag_due`). Due when the bio can be read (a brand of the creator's company has
  Instagram linked by our Meta app) and was not read for 30 days, or when the source hash differs
  from `tags_source` and the last try is older than the last edit, the last bio read or six hours.
- **The job** (`packages/connect/src/brandbase/creator-tags.ts`, started in `host.ts`). Off
  without `TAGS_OPENROUTER_API_KEY`, and off (one warning) without a principal (`TAGS_AS`, else
  `META_WEBHOOK_AS`). Every 5 minutes, one run at a time, at most 5 creators, 2 s apart: the bio
  through Business Discovery (`biography`) from an Instagram account of the creator's own company,
  then one call to OpenRouter's chat completions: `deepseek/deepseek-v4.1-flash` (`TAGS_MODEL`),
  `response_format: json_object`, `reasoning` off, `max_tokens` 200, 30 s timeout,
  `provider: { only: TAGS_PROVIDERS, data_collection: 'deny' }`, `usage.include`. The user message
  is JSON of `handle`, `category`, `bio`, `notes` (first 4000 characters) and `companyTags` (the
  company's 60 most used tags). No name, token or other field is sent. A person with no notes,
  no category and no bio gets no call.
- **Cap.** Each call holds $0.005 until OpenRouter states its cost (`usage.cost`), which replaces
  the hold; a refusal owes nothing; a timeout keeps the hold. At `TAGS_DAILY_USD` (default 1) a
  run stops until the next UTC day. The count lives in the process: a restart starts it at zero.
- **Answers.** The tags are read from the first `{` to the last `}`; anything else, or no `tags`
  list, is malformed: no tag changes, and the person waits six hours. An upstream error or a
  timeout stops the run and records nothing.
- **Web.** `RosterPerson.tags`. The Creators sidebar shows the tags as chips under the name, each
  with ×, and an "Add tag" field (Enter or leaving the field adds; Escape empties it and keeps the
  panel). The search matches a word of a tag from its start (a leading `#` is ignored), and a row
  found by a tag shows that tag. Routes `POST /roster/:id/tags` and `DELETE /roster/:id/tags/:tag`.
  The demo roster has tags.

### Checked

- Playwright, the demo on this worktree: Chromium at 1440 x 900 and WebKit at iPhone 15. Open the
  list, open Clara Goh, type a tag, add it, remove one, close, search "wine". Screenshots under
  the session scratchpad `tags/` (laptop-1 to 5, iphone15-1 to 5). No cut-off text or overlap.

### Release

1. The Production workflow's `release` task with version 1.21.0, then `deploy`.
2. `agent-loadout` with ops
   `influencer.tag_due influencer.bio_set influencer.tag_set influencer.list brand.list` when the
   job runs as the webhook's agent (an agent's loadout does not follow a release).
3. `fly secrets set -a brandfactory TAGS_OPENROUTER_API_KEY=...`, a key with its own credit limit.

### Known limits

- Tags are plain lower-case ASCII; "café" is refused.
- The daily spend resets on a restart or a deploy.
- Business Discovery reads share the Instagram account's hourly limit with the picture job and
  the Inbox: at most 60 reads an hour from this job.
- Saved collaborators who are not on the roster get no tags.
