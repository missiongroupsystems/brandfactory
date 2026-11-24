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
  The companies take turns (one row of each, then the next); in a company, people due a tag come
  first, then those never tagged. An answer to notes that changed while the
  model answered keeps the old try time, so the person is due again at once.
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
  list, is malformed: no tag changes, and the person waits six hours. A 401, 402, 408 or 429 stops
  the run and records nothing. A timeout or a 5xx stops the run, and the person waits six hours (it
  may be their input); any other 4xx is a refusal of that person's input, who waits six hours and
  the run goes on. So one person cannot hold up the rest.
- **Bios.** A Meta rate limit puts the company's bio reads off to the next run, and its people who
  need a bio are not tagged until it is read. An expired sign-in counts every bio of the company as
  read (none found) for 30 days, as a company with no account. A principal that may not list the
  brands reads no bio and still tags. A run reads up to 15 due rows and works on 5: the rows a
  rate limit puts off do not count, so they cannot fill a run. A bio read that fails for a moment
  (the network, a timeout, a server or transient error) leaves that person to the next run; only
  Meta's own answer that there is no bio counts as read.
- **Web.** `RosterPerson.tags`. The Creators sidebar shows the tags as chips under the name, each
  with ×, and an "Add tag" field (Enter or leaving the field adds; Escape empties it and keeps the
  panel; text still in the field when the panel goes is added). The search matches a word of a tag from its start (a leading `#` is ignored), and a row
  found by a tag shows that tag. Routes `POST /roster/:id/tags` and `DELETE /roster/:id/tags/:tag`.
  The demo roster has tags.

### Checked

- Playwright, the demo on this worktree: Chromium at 1440 x 900 and WebKit at iPhone 15. Open the
  list, open Clara Goh, type a tag, add it, remove one, close, search "wine". Screenshots under
  the session scratchpad `tags/` (laptop-1 to 5, iphone15-1 to 5). No cut-off text or overlap.

### Release

1. The Production workflow's `release` task with version 1.21.0, then `deploy`.
2. `agent-loadout` with ops
   `influencer.tag_due influencer.bio_set influencer.tag_set influencer.list brand.list account.meta_list` when the
   job runs as the webhook's agent (an agent's loadout does not follow a release).
3. `fly secrets set -a brandfactory TAGS_OPENROUTER_API_KEY=...`, a key with its own credit limit.

### Review

Two fresh reviewer sessions read the whole diff.

1. Round 1: Escape added the typed tag (blur ran after it), now cancelled; five or more creators
   whose bio reads kept failing filled every run, now ordered after those due a tag and signed-out
   companies counted as read; an answer to notes edited meanwhile hid the edit for six hours, now
   due again at once; two adds at once at 19 tags gave a 500, now `TOO_MANY_TAGS` from the update
   itself; the screen now takes the core's order of tags after the last change.
2. Round 2: nothing serious. A 4xx refusal of one person's input blocked the job, now that person
   waits; a bio put off by a rate limit caused two model calls, now one; a tag typed when the panel
   went was lost, now added; an invalid tag has a hint for screen readers; the changelog entry.
3. Round 3: nothing that breaks the feature. A timeout or a 5xx on one person's input stopped
   every run on that person, now they wait six hours; a company under a Meta rate limit could fill
   every run, now its put-off rows do not count; the release's loadout step lacked
   `account.meta_list`; the 100-removal limit is now in the move's text.
4. Round 4: nothing blocking. One company with many people due filled every run, now the
   companies take turns; a brief Meta failure marked a bio read for 30 days, now that person waits
   for the next run; an empty `TAGS_DAILY_USD` stopped the server, now it means the default.
5. Round 5: see the PR.

### Known limits

- Tags are plain lower-case ASCII; "café" is refused.
- The daily spend lives in the process and resets on a restart or a deploy: the OpenRouter key's
  own credit limit is the hard cap.
- A creator keeps the newest 100 removed tags; past that the model may give an older one again.
- The notes go to OpenRouter's providers as they are (rates and contacts included), with
  `data_collection: deny`.
- Business Discovery reads share the Instagram account's hourly limit with the picture job and
  the Inbox: at most 60 reads an hour from this job.
- Saved collaborators who are not on the roster get no tags.
