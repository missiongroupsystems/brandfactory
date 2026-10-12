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

## Round 2: the filmstrip, and drag to reorder

The owner wanted to drag shots, and found the vertical list of thumbnails flat. Shots are a
reel's frames, so each idea's shots become a filmstrip: 9:16 frames (4:5 for a carousel), 228 px
wide on a computer and 168 px on a phone, the number in a small pill at the top left and the line
over the bottom of the picture on a gradient. The strip scrolls sideways past the page's edge with
snap points and no scrollbar. The shot list takes the page's whole width; Who comes keeps the 680
px column with From the link in the margin beside it, so the reading order stays: when and where,
who (and what the crew said), what we shoot.

A frame drags into a new place inside its idea: the HTML drag with a pointer, a long press by
touch (`components/touch-drag.ts`), the others sliding out of its way (`useSortable`, x axis,
one per idea). The lifted frame scales up and fades while held. The keyboard keeps its way: each
frame has a handle that shows on focus, and Option with an arrow key moves it. The up/down arrow
buttons go. The small drag parts the idea page kept to itself (`accept`, `at`, `inside`,
`nudgeKey`, `Handle`) move to `features/ideate/drag-parts.tsx` so both pages share them.

Concepts tried (screenshots `concept-a|b|c-*.png`): A, a contact sheet with the line under each
frame at 172 px (lines truncate); B, the cinema strip above (chosen); C, the same frames on a grey
tray per idea (reads as a card, and smaller frames). B was built.

## Round 3: one timeline

The owner wants the shots "like a video-editing scrubber": every shot of the shoot side by side on
one scrollable line, rearranged by group or by shot. The per-idea strips become one line
(`ShotList` draws it; `aria-label` "Shots in order"): each idea is a group with a quiet label
over its frames (the hook in the display face, the format in mono, Remove on hover), the frames
at the round-2 size with 8 px between them, and a thin rule with 24 px each side between groups.
The numbers run across the shoot.

Two levels of drag, each its own `useSortable` on the x axis: the groups on the outer list, moved
by their label (pointer, long press, or Option + arrow on the label's handle), which writes the
shoot's `ideaIds` through `setIdeaOrder`; the frames inside each group as before, which write the
idea's shots. A frame dragged over another group is refused, so it stays in its own. While a drag
is within 56 px of either end of the line, the line scrolls that way 14 px a move. `useSortable`
now reads only its container's own children, so the frames' FLIP and the groups' FLIP do not
touch each other's items.

## Round 4: the look of the track

The owner found the timeline ugly. Same structure and behaviour, a new skin: one soft surface
band (radius 18, 12 px padding) holds every clip, like an editor's track; each group is a small
page-coloured pill over its own clips (the hook at 12.5 px medium, the format in mono, Remove on
hover); the clips are 152 px wide (120 on a phone) with radius 10, a hairline inner ring so pale
photos keep an edge, a half-pixel lift and soft shadow on hover, and a two-ring focus ring when a
clip's handle has the focus. The number and the line sit under each clip, mono ink-4 and 12 px
ink-2 on one line with an ellipsis. The thin rule between groups is gone; 20 px of track space and
the next pill mark the next group. A held clip scales up with a shadow; a held group fades.

Two looks were tried (`round4-concept-a|b-desktop.png`): A, the track band above (built); B, clips
straight on the page with a thin lavender bar under each group's label (read as tabs; the clips
floated).

## Round 5: look B

The owner picked B. The band goes: the clips sit on the page, 28 px between groups. Each group's
label is a block as wide as its clips: the hook, the format and Remove on one line, and under
them a 3 px lavender bar (`--layer-shoot`) that spans the clips, like a clip's colour strip in an
editor. The bar deepens to `--layer-shoot-ink` under the pointer and while the group is held, so
the grip reads before the drag starts. Everything else from round 4 stays.

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
