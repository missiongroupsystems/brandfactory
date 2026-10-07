# BrandBase MVP: phases 1 to 6

> **Archived 2026-10-06.** Superseded by a UI-only, no-backend MVP for a demo.
> Nothing here shipped: the branch was reset to `main`. The code (write gate,
> `packages/brandbase` shell, unfinished migration 0028) is on the local branch
> `archive/brandbase-mvp-v1`. See `README.md` in this folder.

Plan: `plan.md`. Handoff and progress log:
`handoff.md`. One section per phase, written as
each phase's Built criteria pass.

## Phase 1: Foundation

Status: Built on the branch, then scrapped (not merged, not released). Accepted: none (the plan names no Accepted criteria for this
phase). Releases: 1.62.0 (the write gate) and 1.63.0 (the frontend and the data
model).

### What landed

- **`packages/brandbase`**, the new frontend: Next.js 16, Tailwind 4, Base UI
  under a shadcn config, Geist, port 3002. Sign-in, session and the no-access
  screens are copied from `web-next` and restyled; the client is
  `hc<AppType>` through the same `/api` rewrite. The shell is the icon rail, a
  brand switcher stored per browser, and a ⌘K stub. Every colour is a
  variable in `src/styles/tokens.css`.
- **Write permissions** (1.62.0). A write gate mounted per prefix enforces
  `canWriteBrand` on brand and project paths and `canWriteWorkspace` on
  workspace paths; `viewer` grants are storable; creating, changing or
  deleting a workspace or a brand and the model settings are admin-only.
  `write-gate.test.ts` sends all 73 mutating routes as a viewer.
- **Migration 0028**: three post statuses, the post-plan columns, the brand's
  weekly target and Pinterest board, and the two share-link tables.

### Decisions recorded before the migration

**One post plan, several channels.** One `social_posts` row is the plan.
`platform` stays its main channel. Extra channels become rows of a
`post_channels` table when the post tab first lets a marketer pick more than
one channel (phase 4), and those rows are what `publish_jobs` hang off. Not
created in 0028, because nothing writes it before phase 4 and an empty table
with no writer is a guess about its columns.

**Where brand guidelines live.** From phase 2, `guideline_versions` is the one
source of truth for brand context: each save writes a version with its
structured fields and the compiled text, and `buildSystemPrompt` reads the
latest one. `guideline_sections` is mapped into the first version once and is
then the old app's data only.

**Share-link tokens are stored as issued.** The token is the capability, like a
signed blob URL, and a marketer copies the same link again from the app, which
a stored hash would not allow. Revocation (`revoked_at`) and expiry
(`expires_at`) are the controls.

**Every status after `idea` stamps the approval**, the publisher's three included:
a post cannot be scheduled, posted or failed without somebody having cleared it.

**`campaign_creator_id` has no foreign key yet.** `campaign_creators` arrives
in phase 5, and its migration adds the constraint.

**The weekly target is on `brands`, and setting it waits for phase 2.** Brand
updates are admin-only since 1.62.0, so the Brand screen's weekly target needs
its own write path; phase 2 adds it with the guideline fields.

### Verified

- Gate: typecheck, lint, format, all tests with a local database (3447, none
  skipped), `brandbase` build.
- Playwright against a local server: sign in with the seeded token, the shell,
  the seven seeded brands in the switcher, ⌘K to Creators, no console errors.
  Screenshots match the frame of `mockups/Main.png`.

### Not done in this phase

- Meta setup (business verification, Page publishing authorisation, test
  Instagram account) is the user's task; tracked in the handoff.
- The old apps' status menus derive from `SOCIAL_POST_STATUS_ORDER`, so they now
  offer the three publisher states too. They are labelled and harmless; the old
  apps are not changed further.

### Release steps (the user)

1. Merge and deploy the server as usual; migration 0028 runs in the release
   command. It only adds.
2. Create a Vercel project for `packages/brandbase` (root `packages/brandbase`,
   build `pnpm -F @brandfactory/brandbase build`), with
   `NEXT_PUBLIC_AUTH_PROVIDER=supabase`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `API_PROXY_TARGET` set to the Fly
   server URL.
3. Add the new origin's sign-in callback to Supabase's redirect URLs.
4. Tell members that creating, renaming or deleting a brand or the workspace,
   and the model settings, are now admin-only.
