# Post options: phases 1 to 1

## Phase 1: every option on the post page reaches Meta, or is hidden

Plan: `post-options-plan.md`. Version 2.67.0, pack 1.16.0, no migration.

### Reproduced first

On a local core with the demo data and an Instagram account linked through the Meta app, a tag
placed on a photo was saved in `draft.shots[0].tags` and the job's payload had no tag. The same for
collaborators, the first comment and the location. A crop was saved, and the original file went
out. A change saved on a scheduled post (Save, a PATCH alone) left the old yes, so the job was
refused at its time: "Waiting for a person to approve this send." (`meta-post.test.ts`, before the
draft moved ahead of the schedule).

### What changed

- `post.publish_job` (pack 1.16.0): the payload adds `collaborators` and `tags` (Instagram, not a
  Story) and `comment` (not a Story), each only when it has something, so a job scheduled before
  the release keeps its yes (a yes matches the payload's hash). A live job keeps the connector's
  `note` in `error`.
- `meta-post.ts`: `collaborators` on an Instagram photo, carousel or Reel; `user_tags` on each
  photo (with its spot) and on a Reel (by name); a bad name or too many people stop the send before
  Meta. The first comment goes on the post once it is live; if it fails, the post stays live and
  the job keeps a note, which the posted view shows.
- `post.ig_media` (internal) and `GET /brands/:b/posts/:id/collaborators` (`meta-collabs.ts`):
  where each collaborator's invite stands (pending, accepted, declined), read live from Instagram.
  The posted view shows it beside each name; the post page says the invite goes out with the post
  and the name shows once the account accepts.
- `cut.ts`: a cropped photo is cut in the browser as the preview shows it (JPEG, at most 1440 px),
  uploaded once, and sent; the post keeps the original (`shots[i].original`, with `cut`) for the
  next edit. The tag editor shows the photo as it will post, so a tag's spot is where Instagram
  puts it; the phone preview places tags in the crop's frame.
- Save on a scheduled post sends its waiting jobs again at their slot with a new yes. A post marked
  scheduled by hand has none and stays a PATCH alone; a save never marks, so no waiting job is
  dropped. After a send the brand reloads, so the next Save in the same tab knows what waits.
- Hidden on the live app: Location (Instagram takes only a Facebook place id, and the search needs
  Meta's review), the AI-generated label (no Graph field), Facebook's audience (not built), and
  Draft with AI where it has nothing to write. The posted view no longer shows a location.

### Review

An adversarial review of the diff found two regressions in the first Save rule (it sent a post
marked by hand, and it could cancel a waiting job through `post.mark`), a stale original after
another screen changed the media, a note no screen showed, the preview's tag spots, the posted
view's location, and the missing loadout step. All are fixed above, each with a test where it is
code. A second pass found three more: `waiting` was stale after a send in the same tab (the
brand now reloads), the release would have broken every waiting yes (empty keys are now left
out), and a crop the browser could not read failed with "Failed to fetch" (now a sentence). A
third pass of those fixes is in the changelog.

### Left

- A change saved within two minutes of the post's time is a PATCH alone, as before, and now also
  breaks the yes for a tag, a collaborator or the comment; the job then fails and can be sent again.
- A cropped photo is read with `fetch`, so the storage bucket must answer CORS for the web app's
  origin. Check one cropped post on the live app before relying on it.
- A Save on a scheduled post is refused when a send rule blocks it (for example, "Reconnect
  Instagram first."): the edit is stored, the send is not.
- Instagram refuses the whole post for a private or unknown collaborator or tagged account; the
  job fails with Meta's words, and nothing is posted.
- Remove the Make path; Location by Page search after Meta's review.
