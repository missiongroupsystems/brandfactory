# BrandBase shoot page and comments: plan

Status: planned 2026-10-12 on `feat/inbox-reply-directions`. Package `packages/web-next`.

## Why

The owner opened a call sheet (`/shoot/cv-shoot-raffles`) and did not know where to look: three
controls in corners, the crew shown twice (a WHO card and a WHO COMES list), and the guest
comments at the very bottom, far from the shot list they are about. The crew role picker has no
way to type a role of its own. And a comment from the link ("do the dough first, the ragù after
3") can be read but not answered or acted on.

## Layout

One left-aligned column of 680 px, in the order someone on the day asks for it:

1. **Head.** Eyebrow `Shoot · Wed 7 Oct`, the title as the page's `h1`, then one line with the
   hours and the address. Under it the quiet row that exists today: `Edit details` (folds the
   form open) and the Lark state (`Synced with Lark`, or `Connect Lark calendar`). Top right of
   the page holds only `Share`; `Calendar` stays top left.
2. **Who comes.** The crew rows (avatar, name, role, reply) and the add-someone row. The invite
   button (`Send Lark invites` / `Invite 2 more` / `Invites sent`) moves into this section's
   header: it is the page's one strong button and sits beside the people it goes to. The WHO
   summary card goes; the count and the reply summary are in the header line.
3. **Shot list.** As today, each idea a heading, numbered shots across ideas, and two arrows per
   row on hover (always on touch) to move a shot up or down inside its idea. The section has
   `id="shots"` so a comment can jump to it.

**From the link** is a 300 px column in the right margin beside the shot list on screens of 1024
px and wider, and comes just before the shot list on a phone. It is never at the bottom.

The guest page (`/share/shoot/<id>`) keeps its layout.

## Data shape

```ts
interface GuestComment {
  id; name; text; when
  replies?: { name: string; text: string; when: string }[]   // the team's answers
  done?: boolean                                              // handled; folded away
}
```

Store (`comments-store.ts`): `replyToComment(kind, id, commentId, name, text)` and
`setCommentDone(kind, id, commentId, done)`. The reply's name is the brand's name.

## Flows

- **Reply.** Each open comment on the team page has `Reply`; it opens a one-line field under the
  comment and `Send` adds the reply, shown indented under the comment on both the team page and
  the guest page.
- **Act.** Each open comment has a `Shot list` link (`#shots`; the idea page passes
  `Storyboard`). The shot list reorders in place with the arrows; the idea page's storyboard
  already drags.
- **Done.** A check button marks the comment done. Done comments leave the list and fold under
  one quiet line, `Done · 1`, which opens them faded with `Reopen`. The guest page shows a done
  comment in place, faded, with the word `Done`.
- **Custom role.** The role select gains `Other…`; choosing it shows a text field for the role
  (`Food stylist`), and the person is added with that role like any built-in one. The role is
  then offered for that person on later shoots, as the past-crew list reads the live crews.

## Ideas join a shoot from the shoot page

Today the empty shot list says "Pick them on Ideate", where the team retypes the shoot's details.
Instead the shot list's header has `Add an idea`, which opens a picker (a popover on a computer,
a sheet on a phone) of the brand's ideas not yet on this shoot: cover, hook, format, and `On
Pasta day, Wed 21 Oct` when the idea is already on another shoot. Picking one puts it on this
shoot at once: an idea's shoot day and hours are its shoot's, so the idea page shows the new day
without a trip. Picking one that is on another shoot asks first, inside the picker: `Move it
from Pasta day, Wed 21 Oct?` with `Move` and `Cancel`; Cancel changes nothing. Each idea heading
in the shot list has `Remove` on hover, which takes the idea off the shoot (`leaveShoot`).

Store: `addIdeaToShoot(brandId, shootId, ideaId)` takes the idea out of any other shoot and adds
it to this one, with the existing `without` rule (a planned shoot left empty goes).

## Tests

- Custom role: pick Other, type a role, add a person; the row shows that role.
- Reply: the team replies; the guest page shows the reply under the comment.
- Done: the comment leaves the open list, `Done · 1` reveals it, Reopen brings it back; the
  guest page marks it done.
- Go to change: the comment's `Shot list` link points at `#shots`, and the arrows move a shot
  down one place.
- Add an idea: picking one puts it on the shoot and the idea's page shows this shoot's day;
  picking one on another shoot asks first, Cancel leaves both shoots as they were, Move moves it;
  Remove takes it off.
- Existing share tests keep passing (the thread still has the `Comments` region).
