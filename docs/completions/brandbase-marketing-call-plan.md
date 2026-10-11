# Marketing call: what Nat asked for, and the demo changes

Source: David's call with Nat (marketing) on 9 October 2026, the transcript
`brandwatch-replacement-call-nat-2026-10-09.md`, and David's Slack thread in #C0BJ72PAHM5. The next
review is Tuesday 13 October, with Philipp watching. The demo stays UI-only: no server, static
data, simulated sends.

## What the demo already does

Month, week and day views with week as the default; event layers that switch off; one brand at a
time; post, reel and story; shared or per-platform captions with AI drafts; location; first
comment; a crop with preset shapes; TikTok's interaction and promotion switches; a grid and phone
preview; best-time suggestion; ideas with references, a storyboard and a shoot day; a Pinterest
moodboard per brand.

## Changes, by area

Each area has one owner and keeps its new data in its own file, so the areas merge cleanly.

### A. Composer (Schedule ships first, so this matters most)

1. **Tag people and Collaborators are two rows.** Tag people names accounts inside the photo.
   Collaborators sends an invite to the other account (Chef Antonio accepts on his Instagram); the
   row says so, and the post shows both names once accepted.
2. **Wrong-shape flag.** A photo whose shape the format does not take gets a quiet flag on its
   thumbnail and a one-tap crop to the right preset (4:5 for a post, 9:16 for a reel or story).
3. **Only the brand's linked platforms.** The brands post on Instagram, TikTok and Facebook. YouTube
   and LinkedIn leave the composer for these brands; the model keeps them.
4. **Google Drive beside Upload.** "From Drive" opens a picker on the brand's folder (Casa Vostra ›
   Final edits). Upload from the computer stays.
5. **TikTok music and promotion options stay**, since the team sometimes uses the music library.

### B. Shoots and sharing

1. **A shoot is a thing with a date, a start and end time, a place, a crew and its ideas.** Its
   page (`/shoot/<id>`) is the call sheet: when and where, who comes, and the shot list from each
   idea's storyboard.
2. **Plan a shoot from ideas.** Select ideas on Ideate, then "Plan a shoot". An idea page's shoot
   day picker gains a time and links to its shoot.
3. **Calendar.** Shoots show with their time ("12:00–17:00 · Shoot at Raffles City") and open the
   shoot page. The shoot layer notes it syncs with the team's Lark calendar; a shoot can send Lark
   invites to its crew (simulated).
4. **Share without a login.** An idea and a shoot each have Share: a public link where a
   videographer or chef views the brief and leaves comments with only a name. The public page has
   no app navigation.

### C. Brand context

1. **A Brand page** (`/brand`, from the brand switcher): tone of voice, words to use and avoid,
   colours, logos, and a file list where each file has a plain title ("Tone of voice", "Brand deck
   2025"). Files upload, rename and delete.
2. **AI uses it, visibly.** Draft with AI in the composer and the hook ideas on an idea page say
   they write in the brand's voice, with a link to the Brand page.
3. **Moodboard sources match what is possible.** Pinterest boards from one shared account, a board
   per brand. Instagram saves cannot be imported: Instagram becomes "DM posts to the moodboard
   account", and posts land on the brand's board. TikTok stays a source (the call never drops it).

### D. Insights

1. **More sources.** Website visits, Google Business Profile (searches, map views, calls, direction
   requests) and reservations, beside Instagram and TikTok, as small multiples on one time axis
   with post markers, so a spike lines up with the post before it. No dual axis.
2. **Sentiment.** The share of positive, neutral and negative comments and mentions, its trend,
   what people praise and complain about, and example quotes. Each post in Posts shows its own
   split.

### E. Inbox

1. **One inbox for comments, mentions and DMs** on the brand's accounts.
2. **AI replies in the brand's voice**, edited before they send.
3. **Complaints come first**, flagged, with "Send to" a named person (the venue manager).

## Not in this round

- Real Lark, Google Drive and Instagram integrations. David asked for a feasibility note; it is a
  separate piece of research.
- Website stats wait for the move from Wix; the demo shows them as a connected source anyway.

## Verification

The full gate passes, every changed page has a desktop and a phone screenshot, and one review runs
before the commit. The branch goes to a Vercel preview for an eyeball before main.

Status: built on `feat/marketing-call-asks`; see
`brandbase-marketing-call-phases-1-to-5.md`.
