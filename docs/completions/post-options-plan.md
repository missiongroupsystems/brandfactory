# Plan: every option on the post page does what it says

## Why

On the live app (direct Meta API), the post page lets a person set collaborators, tag people on
a photo, write a first comment, pick a location, crop a photo, turn on an AI label and choose a
Facebook audience. Each one is stored with the post, and none reaches Meta. The job's payload
(`post.publish_job`) carries only the caption, the files and "Also show in the feed"; the
Graph calls (`meta-post.ts`) send only those. Reproduced on a local core: a tag placed on a photo
is saved in `draft.shots[0].tags` and the payload has no tag.

A collaborator is only an invite: Instagram sends it when the post goes out, and the name shows on
the post only once that account accepts. The page said "Invite sent, waiting for them to accept"
from the post's stage alone, without asking Instagram.

## What changes

| Option | Now | After |
| --- | --- | --- |
| Collaborators | stored only | `collaborators` on the Instagram feed photo, carousel or Reel container. The page reads each invite's state from Instagram (`GET /{media}/collaborators`: pending, accepted, declined) once the post is live |
| Tag people | stored only | `user_tags` on each Instagram photo (`x`, `y` on the photo as sent) and on a Reel (handle only) |
| First comment | stored only | posted on the new Instagram media or Facebook post right after it goes live. The post stays live if the comment fails; the job keeps a note that says so |
| Crop | stored only (the original went out) | the browser cuts the photo as the preview shows it, as a JPEG, and the post sends that file. The original stays with the post for the next edit |
| Tag editor frame | always 4:5, so a tag's spot was off on any other shape | the photo as it will post (its crop, or its own shape) |
| Location | stored only | hidden on the live app: Instagram takes only a Facebook place id, and place search needs Meta's Page Public Metadata Access review |
| AI-generated label | stored only | hidden on the live app: the Graph API takes no such flag |
| Facebook "Who sees it" | stored only | hidden on the live app: the Page post targeting is not built |
| Draft with AI (empty caption) | did nothing on the live app | hidden where it has nothing to write |

Pack 1.16.0: the payload adds `collaborators`, `tags` (per file, in order), `comment`; a live
job's outcome may carry a `note`, kept in `post_jobs.error`.

## Later

- Remove the Make path (`make.ts`, `make-routes.ts`, the Make account screens), now that every
  brand posts through the Meta app.
- Location by Page search, once the Meta app has Page Public Metadata Access.

## Release (production)

Any order is safe: an old server ignores the new payload fields, an old pack sends none, a job
with no people or comment keeps its old payload (and so its yes), and the web app's new route
answers nothing until the server has it.

1. `core publish packs/brandbase`, `core test brandbase 1.16.0`, `core migrate brandbase 1.16.0`
   (no migration), `core promote brandbase 1.16.0`.
2. `core loadout <uid> brandbase all` for each person, and each agent with its own list: the new
   internal move `post.ig_media` is checked against the loadout like any other. Without it the
   invite states do not show (the page shows the collaborators without them).
3. `fly deploy` (the server: `packages/connect` with the core).
4. The web app deploys from `main` on Vercel.
5. Check that the brand's Instagram account is linked through the Meta app: its row in
   `brandbase.accounts` has `details ->> 'via' = 'meta'`. A row without `via` posts through Make,
   which gets none of the new fields.
