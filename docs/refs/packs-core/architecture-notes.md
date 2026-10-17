# Packs on a shared core: an agent-led replacement for app backends

Draft 5, 16 Oct 2026. Scope: a general architecture for Mission's business software (CRUD plus workflow apps), with BrandBase as the first test. Inputs: the calls with Phil and David, Phil's notes, David's proposal "Brand Base on Packs", Pranav's sketch, the BrandBase code on `feat/brandbase-backend`, Bubbles in Launchpad, Flowrunner. Section 0 is the current design; sections 3–9 keep the earlier analysis, and section 0.1 says how option 1d changes them.

Review history: three adversarial passes, each by two independent reviewers (Opus and Sonnet). Draft 4 adds the learning loop (6.1) and the pass-3 fixes: a core-only system role for the runner and webhooks, *at most once* sends with outcome-unknown failures using up the approval, packs stated as trusted code checked by review and CI, a media finalize step, re-approval on moves, and an experiment with a baseline arm, a named grader, a budget and an order. Draft 3 changes: the recommended core is a modular monolith that loads reviewed packs (both pass-2 reviewers); sandboxed hot-loaded code moves to option 3 only; approvals bind a content hash and cover every outside effect; a tenant key and a core-owned tenant policy are added; lesson auto-promotion is removed; Flowrunner's real limits are stated; the experiment is cut and has numbers to decide on.

## 0. Draft 5: after Phil's call and David's proposal (16 Oct)

Inputs: Phil's notes on horizontal and vertical slicing, ontology and packs; David's proposal "Brand Base on Packs" (one door `POST /ops/{pack}/{op}`, ops and rules as versioned data, tests gate promotion). Decisions from the call: LoRA work is dropped for now; finish the pack design before scopes.

**The design in one paragraph.** The platform is horizontal: shared layers every pack runs through (identity and loadouts, the one door with its eight checks (who are you, which version is live, are you allowed, is the input well formed, do the pre-rules pass, run it under row-level security, did it do exactly that, write it to the log), the scheduler, the connectors, the call log, the database, the UI building blocks). A pack is vertical: one business function, such as post scheduling or social listening, bundling its own ontology, ops, rules, tests, playbooks, goals and evals. Like a house: the concrete and the wiring run through every room (horizontal); each room is one function with its own share of both (vertical). A new function is a new room, not a new house.

**What a pack holds (vertical slice):**
1. Ontology: how this function's information is structured: the tables (code, migrations) plus their meaning (definitions, relations, vocabulary, as data). The meaning part can improve itself; table changes stay reviewed migrations.
2. Ops: single actions, the function's own CRUD and logic, written as data (an input schema plus SQL), each with its rules (CEL) and deterministic tests. A single op needs no eval: its tests prove it.
3. Playbooks: multi-step work built from ops (plan a week, run a giveaway), in text: markdown, code or a JSONB row. Each playbook has goals and evals, because its result needs judging.
4. Optional: screens as data, house defaults, suggested roles (loadouts).

Phil's "skill plus plus": deterministic endpoints plus text instructions in one versioned bundle. We avoid the word "skill" because other agent builders use it; the tree is a "pack tree" whose leaves are ops and whose branches are playbooks.

**Change to the recommendation.** Draft 4 recommended option 1c (pack actions as TypeScript, released through CI). David's form is better for this goal, and we adopt it as option 1d: ops and rules are declarative data (SQL under row-level security plus CEL rules), so a pack version goes live by moving a pointer, with no deploy, and with no sandbox: CEL cannot run arbitrary code, and SQL runs under a limited role with parameters bound. The database refuses to promote a version without a passing test run; rollback moves the pointer back. What stays code: tables and migrations, the runtime, OAuth and connectors, the scheduler core, the UI. A new kind of op (for logic CEL and SQL cannot express) is a rare runtime release. The security model in section 7 (tenant wall, owner ∩ agent loadouts, approvals bound to content, at-most-once sends) applies unchanged.

**What else changed:** LoRA (option 5) is dropped for now; model routing (option 6) uses big and small models only. Scopes (5.1) are kept but come after the pack design is final. The learning loop (6.1) starts from David's call log: every click and agent action is one `op_calls` row with op names, so repeated journeys can later be drafted into playbooks.

### 0.1 How option 1d changes the earlier sections

Sections 3–9 were written for option 1c. Under 1d, read them with these changes (from the draft-5 review):

- **Section 4, the core**: the runtime reads the live pack version from the database on each call (no loading at start, no core release per pack). The door is `/ops/{pack}/{op}`. There is no query builder; the guard is the runtime role's grants plus a SQL check when a version is written.
- **Who may write and promote a version**: anyone with the pack-author role may draft a version (agents included, which is option 3). Promotion moves the live pointer and needs two things, checked by a database trigger: a passing test run bound to that version's hash, and a person's yes (an identity with no `agent_of`). Only the runtime role may write test-run records. Promotion rules by risk follow the "tighten fast, loosen slow" rule: a version that only adds or tightens may be promoted by the pack's owner with one tap; a version that loosens a rule or adds an outside effect needs review by Mission.
- **Tests the author cannot weaken**: every version also runs platform-owned tests that no pack can remove: tenant isolation, approvals on every outside effect, at-most-once sends, and the op never runs as the system role. Every CEL rule must have at least one refusal test.
- **Effect class is not pack data**: whether an op causes an outside effect, and so needs an approval, is set by its op kind in the runtime ("effect" ops), not by a field a version can edit.
- **SQL in rows**: one statement per op, parameters bound, a statement timeout, no `EXECUTE`, `COPY`, `RESET ROLE` or large-object calls. The runtime role has an allowlist of callable functions; it has no EXECUTE on `set_config`, `pg_sleep`, `dblink` or `query_to_xml` (Launchpad's denylist was once bypassed through `query_to_xml`, so this is an allowlist, not a denylist).
- **Rules SQL and CEL cannot express**: the text shaping in `domain/publish.ts` uses `\p{Extended_Pictographic}`, which RE2 (CEL's regex engine) does not support, and Postgres regex has no `\p` classes at all (reviewer knowledge, unverified). These become a platform function or op kind (for example `text_for`), released with the runtime. Check which CEL runtime is used: JavaScript ports may not use RE2.
- **Invariants**: one story per day becomes a partial unique index (a migration); idempotency keys become a unique row with the stored answer, replayed by the runtime; per-channel jobs are `INSERT ... ON CONFLICT ... WHERE status IN ('scheduled','failed')`.
- **Timed work**: the claim, the heartbeat and the stuck-job rule live in the scheduler core (code). What the scheduler calls is an "effect" op from the pack.
- **Section 7 security**: "CI bans raw SQL in packs" and "packs are trusted code" no longer apply; the SQL check, the grant allowlist and the platform tests replace them. Everything else in section 7 holds.
- **Rollback limits**: moving the pointer back undoes rules and ops, not an applied migration, a used approval or a sent post.
- **Option 3 under 1d**: an agent-drafted op or playbook is just a draft version; no sandbox is needed. It goes through the same tests and a person's yes.

## 1. The question

Phil: why must API endpoints be statically defined in a deployed backend per app? Can an app be "a database with an agent", where the expertise lives in data packs that improve with use, and the data is the moat?

General form: **one shared core, run once; each app is a pack.** A new app is a pack release of the core, not a new server.

Goals: no server per app; one agent wearing interchangeable packs (hats, pack trees); a self-improvement loop; packs as the product we sell.

Non-goals now: fine-tuning (option 5), retiring app GUIs (David: GUIs stay about 12 months).

Fit: internal business software (most of what Mission builds). Not: high-volume or low-latency systems, heavy compute, strict real-time paths.

## 2. What exists today (checked in source)

- BrandBase server: Hono + Drizzle, about 3,800 non-test lines in `packages/server/src`, about 106 server tests (424 in the whole repo). Not deployed. Rules: `domain/publish.ts` (send blockers, Unicode regex classes), `domain/posts.ts:72` (story-per-day advisory lock), `routes/send.ts` (idempotency keys, one job per channel, version bump), `jobs.ts` (claims due jobs; a job stuck in `uploading` 15 min fails and waits for a person, never retried). Access in `authz.ts` (global admin, or a `members` row; 404 when no access). No company/tenant concept.
- Outside effects in today's routes: post sends, inbox replies (`inbox.ts:64`), Lark invites (`shoots.ts:332`), share links that let outsiders view or edit (`share.ts:69`), replies to guests signed as the brand (`share.ts:102`), media uploads to a client-chosen key that can be overwritten (`media.ts:66-81`, `storage.ts:42` `upsert: true`).
- Publishing is not built in any option: only `simulatedPublisher`; `main.ts` turns the runner off on a real database. `packages/connect` (OAuth, token refresh, deletion webhooks) has no home yet.
- Bubbles: DeepSeek harness per person; MCP with a SQL allowlist and per-table schema notes. Reads through a role login with per-person claims stamped by the host. A denylist was once bypassed with `query_to_xml('SELECT set_config(...)')` (`sql-guard.ts:15-17`).
- Flowrunner: not in production (P6 cutover not started). Its README lists multi-tenancy, exactly-once side effects and delayed runs as non-goals. Its reaper replays unfinished steps. Its sandbox has no host bindings.

## 3. Which part does each backend job

| Backend job | Guaranteed? | Where |
|---|---|---|
| Types, keys, required fields | Yes | Database schema |
| Tenant isolation | Yes, against people and agents; against pack code only by review | One RESTRICTIVE tenant policy per table (with FORCE RLS), owned by the core; one core-only system role for cross-tenant work |
| Who may act on which record | Yes | RLS plus an access check in each action |
| Invariants (one story a day, no double send) | Yes | Constraints and unique indexes first; locks second |
| Business rules with logic | Yes | Ops (SQL plus CEL rules) as versioned pack data, or a runtime op kind for logic they cannot express |
| Outside effects need a human yes | Yes | Approvals bound to a content hash, checked when the effect fires |
| Timers, webhooks, OAuth, outbound calls | Yes, always on | The core's job runner and webhook routes |
| Judgment: campaigns, voice, what "good" is | No | The pack's soft half, read by the agent |
| A drag on the calendar | Must feel instant | GUI calls the action; no model in the path |

## 4. The shared core (run once)

1. **Database** (Supabase Postgres). Every shared table has a `tenant_id` and one RESTRICTIVE policy `tenant_id = current tenant`, owned by the core.
2. **Core server** (one Fly app for every app): loads the installed packs at start; one generic endpoint `POST /actions/<pack>/<action>`; checks the token, the tenant and the input schema; opens a transaction, sets the tenant and claims with `SET LOCAL`, and runs the action through the core's query builder, which includes lock helpers (`lock(key)`, `FOR UPDATE`, `SKIP LOCKED`); writes a trace. Packs are trusted code that runs in the same process: CI fails a pack that imports `pg`, `postgres` or uses raw `sql`/`execute`, and token decryption lives only in core effect code. So isolation from pack code is a review property, not a runtime one.
3. **Generic MCP**: offers each installed action as a tool, from the same catalog.
4. **Job runner and webhook routes**, in the core server: claims due jobs per minute, runs pack-declared effect steps, receives OAuth callbacks and platform webhooks. These are the only cross-tenant paths. They use one core-only system role with listed grants: SELECT and UPDATE on jobs, UPDATE on an approval's use record, SELECT on connections, INSERT on traces, and nothing else across tenants. The runner claims one job at a time, reads the tenant from the job row, then sets that tenant with `SET LOCAL` and runs the pack's effect step under the normal tenant rules (to read the post, brand and media). The core's login role does not own the tables.
5. **Agent machines**: one per person (roadmap), each with an agent identity.
6. **Pack registry**: versions, evals, promotion, the coach loop.

The core is the only server. A pack merge triggers CI: migrations through the release pipeline, tests, then a core release. That is the "deploy": one shared release, not a server per app.

Flowrunner stays for automations people build. It is not the effect runtime until it has tenancy and exactly-once guards.

## 5. What a pack is

One versioned bundle per domain (BrandBase, operations, finance). The agent wears one or more, like a class plus a pack tree.

**Hard half** (git, reviewed, tested in CI, Mission-authored only):
- Schema migrations for the pack's own tables (with `tenant_id`). No policies on core or other packs' tables.
- Actions: TypeScript, input schema, description, the access rule, and the effect class (none, reversible, outside).
- Effect steps for the job runner (BrandBase: publish to a platform; send an inbox reply).
- Tests for every op and rule (deterministic). Single ops need tests, not evals.

**Soft half** (versioned rows per tenant, editable live):
- Playbooks, small and large; steps reference actions.
- Taste: good and bad examples with outcomes; voice.
- Goals and scores.
- Lessons with evidence, status and expiry.
- Evals for behaviour.
- (LoRA dropped for now, 16 Oct.)

### 5.1 Scopes: each kind of content has a home

A pack is not one blob. Each kind of content lives at the scope that has enough data and the right owner for it. The scopes are the same for every app. Seven scopes, from widest to narrowest:

1. **Mission core**: rules for every app: tenant wall, approval floor, the core's own actions.
2. **App** (BrandBase, finance, operations): owned by Mission. The moat.
3. **Company** (tenant): owned by the company admin.
4. **Team** (marketing, finance, operations): a group of people with one function; owned by the team lead. A person can be in several teams.
5. **Workspace**: the thing the work is about, named by each app: a brand in BrandBase, an entity or cost centre in finance, a site or project in operations. Owned by its members.
6. **Person**: owned by that person.
7. **Session**: one task; scratch notes, gone at the end unless promoted.

Which team a session uses: the team that owns the task's pack-tree node (5.2) for that company, for example "Pay an invoice" → finance team, "Schedule a post" → marketing team. The core sets it, like the hat; the agent and content cannot.

| Content | Home scope | Can be narrowed at | Why |
|---|---|---|---|
| Core rules: company wall, approval floor (every outside effect needs a person's yes), system role | Mission core | nowhere | They protect every app and company; no pack can loosen them |
| Schema, actions, effect steps | App | nowhere | Safety and tenancy; companies cannot add code |
| LoRA (dropped for now, 16 Oct) | App | Company, for large companies: trained only on that company's data, loaded only for that company; a workspace's examples go in only if it opts in | Needs thousands of examples; a shared LoRA must train only on curated, consented data or it leaks between companies |
| Model routing | App | Company (allowed vendors, budget, data that must stay on certain models) | A company decides where its data may go and what it spends |
| Evals | App (base suite) | Company and team (their quality bar) | Grades must be stable; scopes can add, not remove |
| Playbooks | App | Company (required steps, locked), team (its process, may add locked steps), workspace and person (may add or reorder steps, never remove a locked one) | Shared know-how must outlive the person who learned it |
| Goals and scores | Company | Team and workspace (may add goals, never contradict a wider one) | The business decides what good is |
| Approval rules | Mission core (the floor) | Company (who may approve, extra checks), team (for example two people for payments over $5k), workspace (stricter only) | Anyone can ask for more approval, never less |
| Style and examples | Workspace (a brand's voice; an entity's report format) | Team (house style), person (draft style) | Each workspace has its own look and sound |
| Lessons | where they were learned | — | They start narrow and move up when they prove themselves |
| Preferences | Person | — | "Shorter captions for me" |
| Scratch notes | Session | — | Thrown away unless promoted |

Two examples of the same scopes in different apps:
- BrandBase, "Schedule Friday's post": app steps → company sign-off step (locked) → marketing team's posting checklist → Casa Vostra voice → Pranav's shortcut → today's notes.
- Finance, "Pay a supplier invoice": app steps → company rule "invoices over $5k need the CFO" (locked) → finance team's two-person check → Entity SG's payment format → Pranav's shortcut → today's notes.

**Two directions.**
- **Down, at the start of a session: assemble a loadout.** The core picks the hard half for the app, then layers the soft half app → company → team → workspace → person, and the narrowest scope wins for style only (voice, examples, draft style). For playbooks, goals and approval rules, narrower scopes can only add or tighten; on a conflict the wider scope wins and the coach flags it. It keeps only what fits the session's token budget and the hat the agent wears (for example "copywriter" equips the caption playbooks and brand voice; "planner" equips the calendar playbooks and goals). The hat and the team select content only, never permissions. The core sets them from the person's role and the task; the agent or any content cannot switch them. The person's role (admin, approver, editor) is an access input to the loadout, not a content scope. The hard half and approval rules never get looser on the way down.
- **Up, when the pack learns: promote.** A lesson, example or playbook overlay is born at the narrowest scope where it was observed (person or workspace). Session → person: the agent proposes, the person taps. Person → workspace or team: the author agrees, and the workspace owner or team lead taps. Workspace or team → company: their owner and a company admin. The promoted item keeps the lesson text, and its evidence stays inside the company. Company → app: only the rules in 6.1 (tap-approved lessons seen in five or more companies, rewritten by the curator with no company data, reviewed by Mission).
- **Taint travels with content.** Anything written in a tainted session (6.1) is marked at every scope. It cannot be promoted or saved beyond the session, and tainted session notes are never loaded into a later loadout.
- **When a person leaves**, their person-scope playbooks and lessons go to their team lead to promote or delete; their preferences are deleted.

**Why this scales.** A new app adds one app pack and names its workspace. A new company adds only a thin overlay and starts from everything the app pack already knows. A new team adds its process and checks once, for every app it uses. A new person adds a few preferences. Each scope has its own size budget, so no layer can crowd out the others in the context window. Learning happens at the edges every day and flows to the center slowly and reviewed, which is how the base pack keeps getting better without leaking anyone's data.

Companies cannot add schema, policies or actions; they ask Mission, or use option 3 later.

### 5.2 The pack tree: ops are leaves, playbooks are branches

A scope says who owns a piece of content. A pack-tree node says what work it is for. Every soft-half item carries both labels, for example (scope = company, node = "schedule on platforms").

A pack-tree node is one action sequence the agent repeats: its playbook, plus the lessons, examples, evals, score and model route attached to it. Nodes nest into a tree, which is the skill tree in Phil's game picture and David's small and big skills:

- Plan a campaign (big)
  - Plan a week
    - Schedule a post
      - Post to Instagram
      - Post to TikTok (privacy, promo label)
  - Write captions in the brand voice

What the second axis changes:
- **Loadout**: the core first picks the nodes the task needs (from the hat and the request), then layers the scopes for each of those nodes only. A "schedule this post" session never loads the campaign-planning lessons.
- **Learning**: every trace names its node. The coach, the critic and the evals work per node, so a change to "Post to TikTok" is tested on TikTok cases and cannot quietly degrade "Plan a week". Each node has a level that rises when its evals and real outcomes improve; Launchpad shows the tree.
- **Model routing** (option 6) is set per node: a leaf like "Post to TikTok" can run on a small model; "Plan a campaign" runs on a large model.
- **Scopes still apply inside each node**: the app defines the node; a company can lock steps in it; a person can add a shortcut. The rules in 5.1 hold per node.
- **Levels mean autonomy, not a score.** A node's level says how much the agent may do on its own for that task:
  - Lv 0 Locked: no playbook; a person does it by hand.
  - Lv 1 Learning: the agent drafts; a person does every step.
  - Lv 2 Assisted: the agent does each step; a person approves each step.
  - Lv 3 Trusted: the agent runs the whole sequence; a person approves only the outside effect.
  - Lv 4 Routine: the agent runs batches (a week of posts); one approval covers the batch, still bound to each item's hash.
  - Lv 5 Specialist: as Lv 4, on a small model (option 6).
  Up one level: at least 90% of the node's evals pass, and the last 20 real runs at the current level had under 5% undos and no rule refusals. Down one level, automatically: an eval regression, or two undos by a person in one week. Thresholds are starting guesses; a company can make them stricter, never looser. No level skips the approval floor (5.1): every outside effect still needs a person's yes. The score bar on the board is progress to the next level.
- **New nodes**: the app pack ships the first tree. A company or person can propose a new node (a sequence they repeat that no node covers); it enters as a person or company node and is promoted like any lesson. A node that needs a new action goes the option 3 path.

## 6. Feedback and self-improvement

Every action writes a trace (actor, tenant, pack versions, action, inputs, result), readable only within its tenant. A session that has read external text (inbox, comments, guest replies) is tainted, and every trace from it is marked.

Signals:
- Objective: refusals, effect success or failure, undo within an hour, time to finish, platform numbers at 48 h and 7 days.
- Subjective: approve or reject, the edit between the agent's draft and what was published, comments, A/B picks.

### 6.1 The learning loop edits the pack itself

The pack is the agent's long-term memory. Learning means a new version of the pack, not a separate memory store. The pack's soft half is stored like a small git repository per tenant: files (playbooks, examples, lessons, evals, goals), each change a commit with a diff, an author, the evidence (trace ids) and a status. The agent reads the pack at the start of each session, so a merged edit changes behaviour on the next session.

One loop, eight steps. Three separate roles do the work, so no agent grades its own change: the worker (the agent that did the task), the coach (proposes changes) and the critic (attacks them).

1. **Act.** The agent works with pack version N. Every action writes a trace that names N.
2. **Observe.** Signals attach to traces as they arrive: a refusal at once, an undo within the hour, the human's edit when they publish, platform numbers after 48 h and 7 days.
3. **Reflect.** The coach (a separate agent session with a fresh context, scoped to one tenant; never the worker session whose traces it reads) reads a batch of traces and signals and looks for patterns that repeat (at least three cases, so one odd day does not rewrite the pack).
4. **Edit.** The coach writes a pack diff. Allowed edits: change a playbook step; add, replace or retire an example; add, change or retire a lesson; add an eval case built from the failure itself (each failure becomes a regression test); improve the ontology's meaning layer (a definition, a relation, a word people use; table changes still go through a reviewed migration); trim or merge to stay within the pack's size budget.
5. **Test.** The core runs version N+1 against (a) the pack's evals and (b) a replay of recent traced situations, comparing N and N+1. The cases the diff was derived from are held out of both, so the diff is never graded on its own source. The diff fails if any eval that passed on N fails on N+1. Evals are only retired by a person.
6. **Critique.** An independent critic agent tries to break the diff. It runs on a different model from the coach (for example the coach on DeepSeek, the critic on Claude), starts with a fresh context, and sees the diff, the evidence and the test results, but not the coach's reasoning. Its brief is adversarial: find overfitting to a few cases, poisoned or tainted sources, conflicts with locked company steps or other lessons, company data that should not be there, and size-budget waste. It returns pass, fix or reject with reasons. On "fix" the coach revises, at most twice; then the diff is rejected or goes to a person with the dispute shown. The critic cannot merge anything.
7. **Merge.** Who merges depends on where the content came from:
   - Only one thing merges automatically: a person's own edit, verbatim, saved as an example (the agent's draft beside the human's final version). It must come from a member of that tenant, and neither the editing session nor the traces behind the draft may be tainted.
   - Everything the coach writes needs one tap from a person in Launchpad, where it shows as a level-up with its evidence and the critic's notes: lessons (also those based on a person's stated reason), playbook changes, and new eval cases.
   - Anything in the hard half (an action, a check, a schema change): it goes the option 3 path, a reviewed pull request and CI.
8. **Watch.** N+1 runs on part of the sessions first. If its scores fall below N's over the next week, the core reverts that one diff (not every later diff) and marks it.

The size budget matters. A pack that only grows fills the context window and gets worse. So the loop also prunes: lessons that no trace has used for 30 days expire (except lessons with a linked eval, which guard rare failures), duplicates merge, and examples keep only the best few per situation. Examples come only from human edits, never from agent output that was approved unchanged, so the pack does not learn its own style back. Like a skill tree with limited points, the pack has to choose.

Upstream: once a month a Mission curator lifts patterns into the base pack. The curator is a cross-tenant actor, so it sees only tap-approved lessons, and only those that appear in at least five tenants (one company cannot seed the base pack). It rewrites them with no company's data, and a person at Mission reviews each base-pack release. This is how the moat grows: each company improves its own overlay daily, and Mission's base pack improves from all of them.

Safety, carried from the review:
- Taint follows the data: a draft is tainted if any trace behind it read external text, and a coach session is tainted if any trace it reads is. Tainted content never auto-merges.
- The coach never grades its own diff: the evals, the replay and the critic are independent of it. The coach never writes the evals that grade its own diff; new eval cases from failures join the suite only for the next diff.
- Company edits stay in the company overlay. The base pack changes only through Mission's curator.
- Every version can be rolled back, and every line in the pack points to its evidence.

What the type of signal does to the pack:
- Objective failures harden downward: lesson → eval → action check or database constraint (step 6's hard-half path).
- Subjective signals stay soft: examples and taste.
- (A LoRA training set from rated examples is dropped for now, 16 Oct.)

## 7. Security model

- **Tenants**: core-owned RESTRICTIVE policy plus FORCE RLS on every table, scoped to the core's login role (a RESTRICTIVE policy only narrows, so each pack table also needs its permissive access policy; the system role has its own permissive policies on its listed tables only; CI checks all three). The query builder exposes no `set_config` or settings calls, and CI bans them in packs. Global admins do not exist; admin is per tenant. The only cross-tenant actor is the core system role (section 4), and a test proves a tenant A effect step cannot read tenant B rows.
- **Agent identity**: each person has a linked agent identity (`agent_of = person`), always narrower than the person: no admin reach, no deletes, one brand per session where the pack asks for it. The agent cannot call any `approve_*` action.
- **Actions**: reviewed code; database access through the core's query builder only; the core logs in as a role that cannot switch roles; claims are stamped by the core.
- **Approvals**: each action declares its effect class. Every outside effect (post send, inbox reply, Lark invite, share link opened to outsiders, guest reply) needs an approval from a human identity. The approval holds one hash per job: what goes out on that channel (text, media hashes, recipients) and the time window. The effect step recomputes its job's hash before it fires and refuses on a mismatch. A post with three channels gets one approval row with three job hashes, and each job records its own use, so a retry of one channel still matches.
- **Media**: the core makes the storage key (never the client), uploads use `upsert: false`, and the core refuses a write URL for any row that is finalized. The finalize step reads the stored file once, records its hash, size and type (ignoring what the client said), and freezes the row. Stored files cannot be overwritten or deleted by any runtime role. The publisher hashes while it streams and aborts on a mismatch.
- **Crash safety**: the guarantee is *at most once automatically*; a person reconciles anything uncertain. An effect step moves its job from `scheduled` to `uploading` in the same statement that claims it, never fires a job already `uploading`, claims one job at a time, and sends a heartbeat while it works (today's `jobs.ts` claims ten at once and has no heartbeat, so this is new). The final `live` or `failed` update only applies `WHERE status = 'uploading'`. A job with no heartbeat for 15 minutes fails as *outcome unknown* and alerts a person (today's `jobs.ts` rule). An outcome-unknown failure uses up the approval for that job; only a definite failure before the platform call keeps it. A retry after an unknown outcome first checks the platform for the post, then needs a fresh approval.
- **Moves and refusals**: a move voids the old approval at once (not at fire time); when a person moves an approved post, the same tap re-approves it. Any refusal at fire time (hash mismatch, used approval) alerts a person; nothing fails silently.
- **Injection**: an injected message can still cause reversible writes the agent identity may do (edit a caption, which voids a pending approval). These are traced and undoable, and the person sees the voided approval.

## 8. The options

### Option 0 — Baseline: a server per app, agent through an MCP

Each app has its own server (BrandBase: the Hono server). GUI and agent (MCP over routes) use it. Packs hold only the soft half.
- Per new app: a server, its job runner, its webhooks, a GUI.
- Pros: built and tested for BrandBase.
- Cons: a server per app; each capability is a change to that app's server; endpoints and expertise live apart.

### Option 1 — SQL actions: the database is the backend

Actions are SQL functions; PostgREST is the endpoint.
- Pros: no server for actions.
- Cons: logic in PL/pgSQL; Unicode-class regexes in `publish.ts` do not port exactly; SECURITY DEFINER and EXECUTE-to-PUBLIC pitfalls; exposing a schema changes the whole Supabase project; timers and outbound calls still need a server.

### Option 1c — Modular monolith: one core server loads reviewed packs (recommended)

Section 4. Actions are TypeScript modules in packs, loaded at start by one shared server.
- Per new app: a pack, a core release, migrations through the pipeline, its GUI (for now), and new effect step types or credentials if it talks to new outside services.
- Pros: today's rules and tests port almost as is; one backend for every app; no sandbox, no hot-loading; invariants stay in the database.
- Cons: a pack change needs a core release (minutes, through CI); one bad pack can break the shared server for every app (a hang, a memory leak or a CPU loop is not contained; tests, timeouts and review reduce this, they do not prevent it).

### Option 1d — Ops as versioned data on one runtime (recommended from draft 5; David's form)

One generic runtime, one door (`POST /ops/{pack}/{op}`, plus MCP from the same ops). Each op is data: an input schema, SQL run under row-level security, CEL pre- and post-rules, and tests. Packs are immutable versions; a live pointer per environment moves only after a passing test run.
- Per new function: a new pack version (no deploy); per new table: a reviewed migration.
- Pros: no deploy for rule or op changes; no sandbox (CEL is not a general language); one rulebook for screen and agent; rollback is a pointer move; the call log is the learning data.
- Cons: logic beyond SQL and CEL needs a new op kind in the runtime (a rare release); SQL in rows is weaker than reviewed code, so tests are mandatory; the runtime must stay free of business words (a CI check).

### Option 1b — Sandboxed actions loaded live

Like 1c, but actions are loaded from the database at run time into a sandbox, with no release.
- Pros: a new action is live in seconds.
- Cons: needs a database bridge into the sandbox (Flowrunner's sandbox has none); code in the sandbox must not forge the caller (`set_config` on JWT claims, `RESET ROLE`); the speed gain is small when every action is reviewed anyway.
- Fit: only for agent-written actions (option 3).

### Option 2 — The agent is the backend

The agent writes SQL through an RLS-scoped role; rules are prose.
- Pros: least code.
- Cons: rules are not guarantees; injection can do whatever the role can; seconds and tokens per click.
- Fit: reads and analysis only (Bubbles).

### Option 3 — Packs extend themselves (after 1d)

When no action fits, the agent drafts an action, its evals and a playbook. They run in a sandbox (1b) against a scratch database. A person reviews; then it either stays sandboxed for that tenant or graduates into the pack through CI. The agent never applies schema changes to production.
- Pros: the software becomes the agent's output, under review. This is where Phil's "endpoints need not be static" becomes real.
- Cons: as safe as the review and the sandbox; needs 1b's bridge.

### Option 4 — Launchpad is the only app (later)

Packs also ship UI blocks; each app is a schema plus a pack inside Launchpad.
- Pros: Phil's end state.
- Cons: rich screens will not match soon; large rewrite.

### Option 5 — A specialist model per pack (dropped for now, 16 Oct)

LoRA on a small open model from a pack's examples and traces.
- Pros: cheaper, faster; weights become part of the moat.
- Cons: needs thousands of good examples; OpenRouter does not serve custom LoRAs (assumption); retrain per change.

### Option 6 — The system routes work to models itself (later, independent)

Each task goes to the model that does it best for its cost, and the routing learns. A small router in the core picks a model per step: a small fast model for routine steps such as filling a caption template; a large model for big skills such as planning a campaign; a model from a different vendor for the critic (6.1). The pack starts with a default routing table. The learning loop then treats routing like any other pack content: traces record which model ran each step and how it scored, the coach proposes a routing change ("route caption fixes to the small model; it scores the same at a tenth of the cost"), the critic attacks it, evals and replay test it, and a person taps it.

- Pros: lower cost and faster replies on routine work; no lock-in to one model vendor; a new model is tried on replay before any real use; the critic stays independent by design.
- Cons: more moving parts; scores can differ in subtle ways between models, so evals must cover each route; a company's rules on where its data may go must be enforced by the router, never by the model.
- Guard rails: the router reads the company's allowed vendors and data rules (scope table, 5.1) and fails closed; tainted sessions never get a bigger model or more permissions by rerouting; the coach and the critic are never routed to the same model.

## 9. Comparison

| | 0 Server per app | 1 SQL actions | 1c Monolith + packs | 1b Live sandbox | 2 Agent is backend |
|---|---|---|---|---|---|
| Servers we run | one per app | core for timers | one | one + sandbox | one for timers |
| New app needs | server, runner, GUI | SQL pack, schema exposure, GUI | pack, core release, GUI | pack, GUI | prose, GUI |
| Rules guaranteed | yes | if SQL can express them | yes | yes, if sandbox holds | no |
| Click speed | fast | fast | fast | fast | slow, costs tokens |
| Injection breaks rules | no | no | no | no | yes |
| Injection causes outside effects | no, with approvals | no, with approvals | no, with approvals | no, with approvals | yes (the agent writes SQL past the actions) |
| BrandBase port | done | rewrite in SQL | mostly copy | copy + bridge | n/a |
| Built today | BrandBase only | nothing | nothing | nothing | reads only |

Option 1d (draft 5) in the same terms: servers we run: one runtime plus the scheduler; a new app needs a pack version, its migrations and a GUI; rules guaranteed if SQL, CEL or a runtime op kind can express them; click speed fast; injection cannot break rules or cause outside effects without approvals; BrandBase port: a rewrite of the rules into SQL and CEL, with today's tests as the cases.

## 10. Recommendation

Build the platform as option 1d (draft 5; David's form): one runtime, ops and rules as versioned data, promotion gated by tests. Option 1c (TypeScript packs through CI) is the fallback for logic that SQL and CEL cannot express. Keep invariants in the database whatever the option. Use option 2 for reads. Plan option 3 as the next step: agents draft new ops and playbooks as pack versions, and the test gate plus a person decide. Option 5 (LoRA) is dropped for now; defer 4 and 6, and record the model for each step in the log now, so routing can learn later. Keep option 0 as the fallback; for BrandBase it is built.

What is new here is not where code runs. It is that one pack carries the endpoints, the effects, the expertise and the evals together; that agents are first-class callers with their own identity and approvals; and that the expertise improves from traces and hardens into rules.

The real test is the second app: if operations or finance needs only a pack plus a core release, the core works.

## 11. Open items

1. Shared Supabase project: does BrandBase share it with Launchpad or the archive? Tenancy, exposed schemas and auth hooks change that project; the owner must approve.
2. `packages/connect` moves into the core (OAuth callbacks, per-tenant token encryption).
3. Web-next calls actions instead of routes: errors, versions, uploads, realtime need a mapping.
4. Users: BrandBase's `users` table, `auth.users`, agent identities, tenants.
5. Pre-existing race: `routes/send.ts:83-96` checks the story slot without the lock `domain/posts.ts:72` takes. A partial unique index on `(brand_id, day) WHERE format = 'story'` closes it in any option, today's server included.

## 12. The experiment (by Monday 19 Oct, draft 5: David's slice plus our tests)

Local Supabase stack only. Never the production database or project settings.

Build (David's Monday slice):
1. A migration: posts, one job per account, brand time zone, client-made ids, the story unique index.
2. A small packs schema: versions, the live pointer with its promotion trigger, `op_calls`, `test_runs`.
3. The runtime path: token check, version lookup, loadout check (owner and agent), JSON Schema, CEL rules, SQL under a limited role, post-check, log.
4. Six ops in SQL and CEL: list, create draft, schedule, move, mark posted, unplan. An MCP endpoint made from the same ops for Bubbles. The calendar calls these ops.

Demo (David's): change 07:00 to 08:00 in a new version; the calendar and Bubbles both refuse 07:30. A version with a failing test cannot be promoted. Moving the pointer back makes 07:30 work again. Pass: the runtime is not deployed between the steps.

Also prove (ours, deterministic, any failure stops the run):
- A member of company A calling every op with company B ids gets not-found; an op never runs as the system role.
- An agent identity can draft a version but cannot promote it, and cannot approve an outside effect.
- A version that edits away a rule's refusal test still fails the platform tests.
- The runtime role cannot call `set_config` or `query_to_xml`.
- Two stories moved onto one day at once: one wins.

Moat test (Q1) and the learning loop test from draft 4 move to after Monday; the log (`op_calls`) is in from day one, so their data starts now.

Not by Monday: real publishing, approval queues, multi-step playbooks, scopes, self-improvement.

## 13. After Monday: the moat test and the learning-loop test (from draft 4)

Q1, does a pack make the agent better? Ten evals written by David before any run, scored by deterministic checks and a judge on a different model with a fixed rubric. Agent model: DeepSeek V4 Flash through OpenRouter. Four arms x ten evals x five runs = 200 runs plus judging; spend cap $30 (estimate), Pranav approves before the first run.
- A. The agent, no pack, today's server through a thin MCP.
- A'. The same pack text pasted flat into the prompt.
- B. The agent with the pack, today's server.
- C. The agent with the pack, on the 1d runtime.

Decide: the moat holds if B beats A by 20 points or more and beats A' (paired per eval). C versus B is reported, not a gate.

Learning-loop test: 30 drafts (separate from the evals), each with a human edit by Pranav or David, recorded as `op_calls` traces. One coach cycle produces a pack version; it is tested, critiqued and promoted. It works if version N+1 beats N by 10 points or more on the evals and no eval that passed on N fails.
