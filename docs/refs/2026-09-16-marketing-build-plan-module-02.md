# Marketing — Build Plan (Module 02)

**Source:** Marketing discovery workshop, 16 September 2026 — Phil, Natalie, Chloe, David. Phil recused himself from asking, to avoid steering the department whose tool he built. Plans as of 21 September 2026.

## Agent brief

You are working on the Marketing module of Mission Systems (Brand Factory / Launchpad) for Ebb & Flow Group's multi-brand F&B portfolio. Use this document as your source of truth for context, priorities and scope.

- Work in tier order: **Urgent → High impact → Nice to have → KIV**. Do not start KIV items.
- MKT-0 comes before anything else. Every other item assumes the department is actually using the tool.
- Respect the out-of-scope lines in the stack table (Canva, Brandwatch, PR agency, website e-gift cards).
- Do not build a one-off Google Drive connector; image work waits for org-level Workspace integration.
- Brand names in the source transcript may be garbled. Confirm them before building against them.

## The headline

Adoption of Brand Factory is zero, and the cause is ours. The calendar they wanted was pulled off the deployed front end during a design migration and nobody told them. Asked whether they use the tool: "No." Everything below assumes users, so re-exposing the calendar comes before any new feature.

## Findings

1. **The users ranked their own roadmap in two questions.** Asked which item would save the most time, they said the calendar. Asked whether that was the thing that would make them use the tool daily: "Yeah, because we use all the other stuff."
2. **They ranked the AI feature last, unprompted.** Offered agent-generated post ideas seeded from the cultural calendar and brand guidelines, the answer was that ideation can be secondary, because ideation is the part they consider their own work.
3. **The calendar is a production pipeline, not a calendar.**
   - Every brand in one view.
   - Posts, shoots and events on one grid, with events synced from the events module rather than re-entered.
   - Cultural and public holidays enriched in.
   - Clicking a day opens the content plan itself: format, hook, dish, talent, which freelancer is filming, and a status running **idea → approved → filming → editing → posted**.
   - Placeholders matter, so a slot three weeks out can show that it has no post yet.
   - Per-brand filter and export, to hand to the shooting team.
4. **Voucher generation is manual and high volume.** Designs sit in Canva, serial numbers are generated with Claude, the result is saved as a PDF, and Monica keys it into Atlas by hand. Batches run 50 to 100. The e-gift cards sold on the website are out of scope and stay as they are.
5. **The image library holds two distinct asks.** Chloe is downloading high-res files one at a time, renaming each locally and re-uploading, because bulk rename does not work in the browser. She wants (a) a photography view per brand, and separately (b) a reverse image search, so that when a colleague sends a screenshot of a dish she can find the original file. Phil estimates 80% of images can be tagged deterministically from folder and filename.
6. **They were not on Launchpad at all.** The marketing request form they asked for can be built with forms that already exist, once they have accounts.

## The marketing stack

| Tool | Used for | Our position |
|---|---|---|
| Canva | Post design, decks, post planning | Not a target. They still need Canva. |
| Brandwatch | Scheduling across every brand account, plus reporting | Leave it. It works and nothing is exported. |
| Excel and Sheets | The content calendar, as a literal grid, and expenses | The replacement target. |
| Dropbox → Google Drive | Photo and video assets, migrating by hand | Blocked on Workspace integration. |
| Pinterest | Mood boards, one board per brand | Already structured correctly. Link as agent context. |
| Instagram saves | Where post-level inspiration actually lives | Not publicly readable. Needs a share-to-agent habit. |
| PR agency | All influencer and media outreach | Out of scope. Marketing only approves the lists. |

## Build plan

### Urgent

- **MKT-0 — Re-deploy the calendar, add Natalie and Chloe to Launchpad, walk them through it.**
  Not a build. The department's adoption is zero because of a silent regression on our side, and until this is done nothing else here has an audience. Cost: a deploy and twenty minutes.

### High impact

- **MKT-1 — The content calendar, polished and shipped.**
  Multi-brand view, posts, shoots, events and cultural dates, day-detail content plan with the status pipeline, per-brand filter and export. Their own first choice, and it replaces a spreadsheet they already live in, so adoption needs no persuasion.
- **MKT-2 — One-way sync from the events module into the marketing calendar.**
  Removes duplicate entry and makes the calendar the single planning surface. The difference between a tool and the tool.
- **MKT-3 — Voucher generator writing to Atlas.**
  Standardised branded design, automatic serial numbers, POS entry on generation, printable on request. Entirely manual today at 50 to 100 per batch, and it also removes Monica's keying work in operations.

### Nice to have

- **MKT-4 — Consolidate the historical influencer sheets.**
  A data-collection job, not a build. They offered the sheets in the room; chase them.
- **MKT-5 — Marketing request form.**
  Self-serve with existing forms, once they have accounts.
- **MKT-6 — The rename and annotation tutorial for Chloe.**
  Promised in the room and not yet delivered. Unblocks the manual asset migration now, without waiting for the Drive pipeline.
- **MKT-7 — Link per-brand Pinterest boards and reference accounts as brand context.**
  The boards are already one per brand. Cheap context that makes the ideation layer possible later.

### KIV (keep in view — do not start)

- **MKT-8 — Drive index, annotation pipeline, photography view per brand.**
  Blocked on org-level Workspace integration. Do not build a one-off Drive connector for it.
- **MKT-9 — Reverse image search.**
  Parked by name in the room. Open: how much is deterministic from folder and filename, and what a first vision pass would cost.
- **MKT-10 — Ideation and mood-boarding inside the calendar.**
  The users ranked it last, and it needs new designs. Build it into a product they already use daily.
- **MKT-11 — Moving reporting off Brandwatch.**
  Works today, lives in-app, nobody complained.
- **MKT-12 — Instagram saves as references.**
  Needs a behaviour change, and only pays off once MKT-10 exists.

## Open questions

- **How do we stop the next silent regression?** A shipped feature was pulled during a design migration and no user was told. That is a release-process gap, not a marketing one.
- **Does the POS actually enforce outlet-restricted vouchers?** Phil thinks not. If it does not, either stop offering the restriction or enforce it at generation. Check before the voucher build ships.
- **How well documented is the Drive metadata really?** The whole cost estimate for the photography view turns on it, and nobody has looked.

## Caveats

Which of Natalie and Chloe holds which workflow is inferred from the transcript, not labelled: the calendar ranking and the image migration come from the same speaker. Several brand names are garbled by the transcription and should be checked before anything is built against them.

## Related dependencies (from other modules)

- **Google Workspace org-level integration (LP-5)** — blocks MKT-8 and MKT-9.
- **Agent permissions mirror the user (LP-2)** — any agent feature in the calendar must query under the user's credentials through row-level security.
- **Monica (Operations)** currently keys vouchers into Atlas by hand; MKT-3 removes that work. She was not in the workshop.
