# Packs on a core: the proposal

Status: agreed direction, 17 Oct 2026, from the design work with Phil and David. BrandBase is the first app built this way. The implementation plan is `packs-core-plan.md` beside this file.

The board is in `docs/refs/packs-core/`: `board.png` (all sections), `board-1-architecture.png` (the architecture) and `board.excalidraw` (editable). `architecture-notes.md` there is the long research record: options weighed, three rounds of adversarial review, and the security findings. Read it only when this file does not answer a question.

## The idea

Today every app has its own backend: Launchpad runs `launchpad-backend`, BrandBase has the `brandfactory` server (built on `feat/brandbase-backend`, not deployed), and Flowrunner runs five Fly apps. That is seven Fly apps, and every new app means another backend with its own routes and its own copy of the rules.

In this design there is one small backend, the **core**, for every app. Everything app-specific lives in a **pack**: versioned data that the core reads and enforces. An app is its screens plus its pack. A new app, a new rule or a new action is a new pack version, not a deploy. People (through screens) and agents (through tools) call the same API, and the same rules check both.

## Five words

- **Pack**: one business function. It holds an ontology, moves and plays. Versioned data.
- **Core**: the shared backend. Code, deployed rarely. It knows no business words.
- **Move**: one action (one op). Deterministic. Tests prove it; it needs no evals.
- **Play**: multi-step work built from moves (plan a week). Judged by goals and evals.
- **L0–L4**: how much an agent may do alone on a play, like self-driving levels.

Plain terms used below: **loadout** (the moves an agent may use, never more than its person's), **briefing** (what the agent reads for one task), **ontology** (how a pack's information is structured and named), **scope** (who owns a piece of a pack).

## What a pack holds

1. **Ontology.** The pack's tables (migrations, reviewed like code, applied by the core's migrate step) plus their meaning as data: definitions, relations, the words people use.
2. **Moves.** Each move is data: an input schema (JSON Schema), one SQL statement run under row-level security, pre- and post-rules, and tests. Each move has a kind set by the core (read, write, or effect). An effect move reaches outside the app (a post, a message) and needs a person's yes.
3. **Plays.** Multi-step work in text (markdown or a JSON row), naming the moves it uses, with goals and evals.
4. **Optional:** model routes (small model for moves, big model for plays), screens as data, defaults, suggested roles.

A pack version is frozen once published. A live pointer per environment says which version is live. The database refuses to move the pointer unless that version has a passing test run, and a person approves the move. Rollback moves the pointer back.

## The core

One deployment, with these parts:

1. **The API.** One endpoint, `POST /ops/{pack}/{op}`, for every app's screens; the same moves are offered to agents as MCP tools. Every call passes eight checks: who are you, which pack version is live, may you call this move, is the input valid, do the pre-rules pass, run the SQL under row-level security, did it do exactly that (post-rules), write it to the log.
2. **Identity and loadouts.** Supabase Auth says who you are. An agent's loadout can never exceed its person's: the core checks both on every call, so a person who loses a right takes it from their agent at once.
3. **Pack registry.** Pack versions, the live pointer, test runs and loadouts, in a `packs` schema.
4. **The log.** One row per move, by people and agents, with the pack version and op name. It is the learning data later.
5. **Scheduler.** Calls a move at a set time, as the person who scheduled it. Generic code; what it calls is pack data.
6. **Connectors.** OAuth and tokens per account, behind effect moves (`packages/connect` today).
7. **Test runner.** Runs a pack version's tests against a throwaway database.

The core must stay free of business words: no "brand", "post" or "invoice" in `packages/core`. A test enforces it.

What stays code: the core itself, table migrations, connectors, the scheduler's loop, and the screens. Everything else is pack data.

## How the agent works (for context; not built in the first phases)

On each task the agent decides: what is asked (reads the ontology) → which packs (its loadout) → a move or a play (a node in the pack tree) → which model → does it need a person's yes → do it (moves through the API) → for plays, is it good enough (goals and evals). Permissions come from the API and the loadout, never from pack text.

## Later, out of scope for the BrandBase build

- **Learning loop.** A coach reads the log for repeated journeys and proposes a pack change; a critic on a different model attacks it; tests and evals run; a person approves; the new version runs on part of the sessions, then the pointer moves or moves back.
- **Pack tree and levels.** Plays level from L0 (a person does it) to L4 (the agent runs a batch, one approval per batch). No level skips the approval floor.
- **Scopes.** Core ⊃ pack ⊃ company ⊃ team ⊃ workspace ⊃ person ⊃ session; inner layers can only add rules or make them stricter.
- **More apps.** Launchpad and Flowrunner as packs on the same core, and the core moving into a trimmed `launchpad-backend`. Flowrunner's sandboxed code steps would need a sandbox move kind (open question).
- **LoRA fine-tuning.** Dropped for now.

## Security rules (from the review; non-negotiable)

- Promotion needs a passing test run bound to the version's hash **and** a person's yes (an identity that is not an agent). Agents may draft versions, never promote them.
- Every version also runs platform tests that no pack can remove: company isolation, approvals on every effect move, at-most-once sends, and no move ever running as the core's system role. Every rule has at least one refusal test.
- A move's kind (and so whether it needs approval) is set by the core, never by a field a pack version can edit.
- SQL in a move: one statement, bound parameters, a statement timeout; no `EXECUTE`, `COPY`, `RESET ROLE` or large-object calls. The runtime role has an allowlist of callable functions; no `set_config`, `pg_sleep`, `dblink` or `query_to_xml` (Launchpad's denylist was once bypassed through `query_to_xml`).
- Row-level security is forced on every table, keyed by brand membership (later by company). Moves never run as the system role; only the scheduler's claim and webhook lookups use it.
- Approvals bind a hash of what goes out, are checked again when the effect fires, and an edit voids them.
- Sends are at most once automatically: a job is claimed in one statement, an unknown outcome uses up the approval, and a person checks before any retry.
- Moving the pointer back undoes rules and moves, not an applied migration, a used approval or a sent post.
