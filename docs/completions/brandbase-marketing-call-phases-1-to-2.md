# Marketing call: completion

Plan: `brandbase-marketing-call-plan.md`. Branch: `feat/marketing-call-asks`. UI only; every
integration (Lark, Google Drive, Instagram, Pinterest, TikTok, Wix, Google Business Profile,
reservations) is simulated on static data.

## Phase 1: the five areas

Each area was built in its own worktree and merged.

- **Composer.** Tag people (tap a spot on the photo) and Collaborators (an invite the other account
  accepts) are separate rows, and the Instagram preview shows "casavostrasg and chefantonio". A
  photo in the wrong shape gets a quiet "Crop 4:5" or "Crop 9:16" that opens the crop on that
  preset (`shapeFix`). Only the brand's linked platforms show (`LINKED` in `data/publish.ts`:
  Instagram, TikTok, Facebook); the model keeps YouTube and LinkedIn. Google Drive sits beside
  Upload. TikTok gains Sound ("In the video" or "From TikTok"); "Commercial content" is relabelled.
  The When card leads with the slot and a "Best time" button. A new post starts on every connected
  account, as the model's comment always said.
- **Shoots and sharing.** A shoot has a day, start and end, place, crew and ideas
  (`data/shoots.ts`, `features/shoot/`). Its call sheet (`/shoot/<id>`) shows when, where, who,
  and a shot list from the ideas' storyboards, with simulated Lark invites. Ideate's Current ideas
  can select ideas and "Plan a shoot". Calendar chips read "Shoot · Raffles City · 12:00" and open
  the call sheet; shoots are on by default. Ideas and shoots share a public link
  (`/share/idea/<id>`, `/share/shoot/<id>`): no app navigation, guests comment with a name.
- **Brand kit** (`/brand`, from the brand switcher): voice, say/not pairs, colours, logo, titled
  files (upload, rename, new version, delete). "In {brand}'s voice" links sit beside Draft with AI
  and the idea page's hook ideas. Moodboard sources: Pinterest picks the brand's board from the
  team's one account; Instagram is "DM to @mission.moodboards with #brandtag"; TikTok saves stay.
- **Insights.** Five sources in the eyebrow. Overview gains "Beyond social": Instagram, TikTok,
  website, Google Maps views and bookings as small multiples on one time axis with post markers,
  a computed lead finding ("+67% bookings after…") and bookings by kind of post. A Sentiment view:
  positive/neutral/negative across comments and mentions, a 12-week trend, praise and complaint
  themes, quotes. Each post in Posts shows its split. Data in `data/insights-hub.ts`, derived from
  the existing posts so every spike follows a real post.
- **Inbox** (`/inbox`, fourth nav item with a count): comments, tags and DMs, complaints first,
  noise folded away, an editable AI reply in the brand's voice, "Send to" a named person for a
  complaint, and an "All caught up" end.

Review (one Sonnet pass): duplicate React keys on shoot chips (fixed: key by `shootId`); empty
planned shoots left on the calendar (fixed: a planned shoot goes with its last idea, a Lark one
stays); share links for things made live only work in the same tab (by design: no backend).

## Phase 2: a second pass over the call

An independent pass over the transcript and thread found these gaps, now built:

- Landscape posts pass (Instagram feed takes 4:5 to 1.91:1).
- AI drafts are per brand, and "Improve" cleans the user's own caption instead of replacing it.
- Any time of day: a typeable time and quarter-hour steps; `slot` keeps "Day N Mon, HH:MM".
- The outcome view says when the collab invite goes out.
- "Save as {brand} default" for TikTok settings.
- A shoot can be added by hand ("New shoot" on Schedule; the phone "+" offers post or shoot), and
  stays with no ideas.
- Crew replies after Lark invites (Going, Can't make it, No reply yet) with a summary line.
- The desktop Day view draws a shoot over its hours.

Left out on purpose:

- One story per day is an earlier product rule, though Instagram allows more; left for a decision.
- Shared pages are view and comment only; no guest editing or PDF export.
- No AI tags on moodboard posts (ideation ships after scheduling).
- Lark and Google Drive feasibility research is a separate task.
