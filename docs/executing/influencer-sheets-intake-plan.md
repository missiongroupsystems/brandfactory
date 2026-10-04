# MKT-4 — Consolidate the historical influencer sheets

**Status:** waiting on the sheets. Nothing below is built. Written 4 October 2026.

**Source:** Module 02 build plan, `docs/refs/2026-09-16-marketing-build-plan-module-02.md`. The team offered the sheets at the 16 September workshop. MKT-4 is a data-collection job, not a build: the roster screen, the schema and the importer already exist.

## What is already in the workspace

The roster holds **146 creators** from one source, the Curly's media list, imported by `pnpm -F @brandfactory/db db:import-influencers`. Its rules are written in the `SEED_INFLUENCERS` docstring in `packages/db/src/seed.ts`, and this plan keeps every one of them:

- **The key is `(workspace, platform, handle)`.** `influencer_accounts_workspace_platform_handle_key` refuses a second creator on the same handle. A new sheet's row matches an existing creator by an account, never by name.
- **Five creators did not import** for want of a confirmable handle: Lorraine Koh, Grant Wee, Natassia Siu, Marissa & Denise Lum, Jaclyn Chan. A new sheet that names one of them with a handle closes that gap.
- **`brandIds` is empty on every row**, because there is no Curly's brand. A historical sheet from one of the seven brands is the first source that can say which brand a creator worked with.
- **Nothing is invented.** No engagement rate the source did not measure, no handle a search guessed.

## What to ask for

Ask Natalie and Chloe for:

1. **Every sheet, as it is.** Google Sheets links or Excel files. No clean-up first: the clean-up is this job, and the original tells us what a column meant.
2. **For each sheet, one line:** which brand or campaign, roughly which dates, and who kept it.
3. **Which column, if any, is a fee or a rate.** See *Fees* below.
4. **Any creator they know is a duplicate under two names**, or who changed handle.

The message to send is at the end of this file.

## Intake, in order

1. **Collect.** Keep the raw files out of the repository. They carry personal contact details and possibly fees. Store them in the team's Drive, and share them with the person who runs the import.
2. **Map each sheet to one table** with the columns `name`, `platform`, `handle`, `followers`, `url`, `vertical`, `status`, `brand`, `notes`, `source`. One row per account, so a creator on two platforms is two rows with the same `name`. `source` names the sheet and the row number.
3. **Normalise the handle.** Lowercase, strip a leading `@`, strip a profile URL down to its handle. This is the step that makes the duplicate check work: `@LittleExpats_SG`, `littleexpats_sg` and `instagram.com/littleexpats_sg/` are one account.
4. **Check against the roster** on `(platform, handle)`. Each row lands in one of four piles:
   - **New** — no account matches. It becomes a new creator.
   - **Same creator** — an account matches and the name agrees. It adds a brand link, a status change or a note to the existing creator. It never overwrites a figure; see step 5.
   - **Conflict** — an account matches and the name does not. A person decides.
   - **No handle** — the row names a person and no account. A person decides, or the row stays out. This is the rule that kept five creators out the first time.
5. **Follower counts.** Keep the existing figure unless the sheet's is newer and dated. A historical sheet is usually older than the media list, so its count is usually the stale one. When a sheet's figure is kept, `notes` says which sheet and which date.
6. **Status.** `active` if the sheet shows the creator delivered work; `past` if that work ended and no newer relation exists; otherwise leave the existing status. Never move a creator from `active` to `prospect`.
7. **Brands.** A sheet that belongs to one of the seven brands links its creators to that brand through `influencer_brands`. The first import wrote no brand links on purpose; this is the step that writes them.
8. **Review.** Send the *Conflict* and *No handle* piles to Natalie or Chloe as one short sheet, with the candidates side by side. Nothing in those piles is written until a person answers.
9. **Dry run, then write.** The import prints what it would insert, link and annotate. A person reads the dry run, then the same command runs without `--dry-run`.

## The import script

A second script beside `import-influencers.ts`, not a change to it. That one writes a fixed fixture under fixed ids; this one reads a mapped file. It keeps the same four properties:

- `--workspace <uuid>` required, with no default, and an unknown workspace refused before any write.
- `--dry-run` prints the four piles and the planned writes, and writes nothing.
- **Idempotent.** A second run writes nothing. New creators get ids derived from `(workspace, platform, handle)`, and every insert is `ON CONFLICT DO NOTHING`.
- One transaction per run.

The mapped file is a CSV in the shape of step 2, read from a path given on the command line. **It is not committed.** Unlike the media list, which holds public handles and follower counts only, the historical sheets may hold phone numbers, emails and fees.

## Fees

The roster has no fee column, and this plan does not add one. If a sheet carries rates, the rates stay in the sheet, and the import writes nothing from that column. Whether a fee belongs on a creator — and who may read it — is a product decision with an access-control answer, the same shape as the Operations Hub's sensitive contract value. Raise it with the team before any column is added.

## Done when

- Every sheet the team sent is either imported or listed with the reason it was not.
- The *Conflict* and *No handle* piles are answered or recorded as left out.
- The roster screen shows the new count, and the brand filter returns creators for the brands the sheets covered.
- A changelog entry states the counts: creators added, accounts added, brand links written, rows left out. No migration.

## The message

> Hi Natalie, Chloe — for MKT-4, could you send me every historical influencer sheet you have? Links or files are both fine, and please send them as they are, without tidying them up.
>
> For each one, a line on which brand or campaign it was for, roughly when, and who kept it would help.
>
> Two other things:
> 1. If any column is a fee or a rate, tell me which one. I will keep fees out of Brand Base until we agree who should see them.
> 2. If you know a creator appears under two names, or changed their handle, tell me.
>
> I will match everything against the 146 creators already in Brand Base by their handle. I will send back a short list of the rows I cannot match with certainty, for you to decide. Nothing on that list goes in until you answer.
