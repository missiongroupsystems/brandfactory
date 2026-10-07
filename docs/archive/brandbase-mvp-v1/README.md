# BrandBase MVP, first plan (archived)

Archived on 2026-10-06. This was the first BrandBase MVP: a new Next.js
frontend in this repo on the existing Hono server and database, in six phases
(foundation, brand and AI context, calendar, publishing, creators, ideas).

It was replaced the same day by a UI-only MVP with no backend, because the team
needs a demo by 7 October. Nothing here was merged or deployed.

| File | What it is |
| --- | --- |
| `plan.md` | The six phases with Built and Accepted criteria |
| `handoff.md` | Workflow rules and the progress log for the implementer |
| `phase-1-completion.md` | Phase 1 decisions (post channels, guideline versions, share-link tokens) |
| `DESIGN.md` | Tokens, status glyphs, brand dot colours, screen list |
| `mockups/` | Screenshots of every screen, with the `.dc.html` source markup |
| `architecture/` | The original system design board (fresh-repo design) |

The mockups and `DESIGN.md` are still the best reference for how BrandBase
should look. The code from phase 1 is on the local branch
`archive/brandbase-mvp-v1`, not pushed:

- `84181e4`: the server write gate (a `viewer` grant reads only; workspace and
  brand structure become admin-only).
- `b87a249`: `packages/brandbase`, the sign-in and the app shell.
- `b7e80f5`: unfinished migration 0028 (post-plan fields, share links), never
  reviewed.
