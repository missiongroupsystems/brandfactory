# Pinterest boards on the moodboard: phases 1 and 2

Branch `feat/pinterest-boards`, 2.42.0, brandbase 1.11.0. From David's feedback of 29 Oct: he
could not see which board was connected or its address, could not connect a second board, and
could not change the board. No plan document: a one-day change on 2.37.0's design.

## Phase 1: several boards per brand

- **Pack 1.11.0.** Migration `0019_pinterest_boards.sql`: the moodboard reads
  `accounts.details.boards`, a list of board ids, in place of 0015's one `details.board`.
  `account_keys` says Pinterest is connected while the list is not empty, or while the old key is
  set (1.10.0's move, live between migrate and promote, writes only that). An existing `board`
  becomes a list of one, and the old key stays until the next change, so the old server still
  reads it until the core is deployed. `account.board` (internal) now takes `boards` (up to 5,
  no repeats) and drops the old key. Walls as before: `brand.reachable`, the account must exist.
- **Server.** `GET /brands/:brand/pinterest` gives each board its `url` and marks every picked
  board. `PUT` takes `{ boardIds }`, the whole list; each id must be on the account, and an empty
  list turns Pinterest off and keeps the account. `GET .../pins` answers
  `{ boards: [{ id, name, url, pins }] }` in the order picked: one read of the account's boards
  and one per board, with a page of `max(50, 250 / boards)` pins per board (at most six reads
  and 250 pins). A board deleted on Pinterest, or one whose pins fail to load, is left out. The API gives no board URL: `boardUrl` builds
  `https://www.pinterest.com/{owner}/{slug}/` from the board's owner and name, and falls back to
  the owner's profile when the name has no letter or digit.
- **web-next.** Each board is a chip. A small × fades in on hover or focus (on a touch screen,
  on the chosen chip only); it turns the chip into a quiet red "Remove {board}?" with a ✓ that
  removes the board. Leaving the chip with the mouse, Escape, focus leaving or a press elsewhere
  keeps it. The chip row never wraps: it scrolls sideways, with a fade at an edge that has more.
  On the core, once Pinterest is connected, the "+" opens the existing board picker, now with
  checkboxes: the boards read now are ticked, Save keeps the list, and a ↗ beside each row
  (on hover or focus, always on touch) opens the board on Pinterest in a new tab. The old pins
  leave only after the server takes the change. The static demo is unchanged.
- **Tests.** Pack: `accounts.json` (two boards, one removed, the last removed turns Pinterest
  off, the old key dropped, repeats and a 6-board list refused, another company's person
  refused) and `upgrade.test.ts` (0019 on a 1.10.0 database). Server: `pinterest.test.ts` (several
  boards, the page size, a deleted board, bad lists, `boardUrl`). Web:
  `pinterest-boards-remote.test.tsx` (chips, the × and its confirm and cancel paths, the "+" picker, its ↗ link and Save).
- **Checked in a browser.** A local core with the pack and a stand-in Pinterest, Playwright at
  1280 × 860 and 390 × 844 (viewport only): connect, tick boards, the chips, a chip's × and its confirm
  state, the "+" picker with ↗ (`https://www.pinterest.com/casavostra/kitchen-crew/`), add a
  board, remove one, a row of five boards that scrolls.

## Phase 2: one-click remove and a picker that scales

Branch `fix/pinterest-board-picker`, 2.43.1, from `release/pinterest-make`. The owner's feedback
after the release: a confirm step is too slow for a board that two clicks add back, and the
picker grows too tall with many boards.

- **web-next.** A chip's × removes the board at once. The picker lists the boards on the
  moodboard first ("On the moodboard"), then "Other boards", in the order of when it opened; the
  headings show only when both groups have boards. More than six boards add a search field that
  filters by name; Escape clears it before it closes the picker. The list is 264 px and scrolls.
- **Tests.** `pinterest-boards-remote.test.tsx`: one-click remove, the order and headings, the
  search on a seven-board account.
- **Checked in a browser.** A stand-in core answered by Playwright, desktop and phone: one-click
  remove, twelve boards, a search.


The slug rule against a real Pinterest account with unusual board names (accents, emoji). A
board renamed on Pinterest gets a new address; the link follows the current name.

## Production steps

In this order, with `DATABASE_URL` for `brandbase-db` and a `core login`, as for 1.10.0. Do the
migrate and steps 2 to 4 back to back, and ask the team not to change boards meanwhile: after the
promote the old server cannot save a board pick, and before the web deploy the old web app cannot
read the new server's pins answer. Do not roll the core back alone after a board change: the old
code reads only the old key.

1. `core publish packs/brandbase`, `core test brandbase 1.11.0` (197/197 expected),
   `core migrate brandbase 1.11.0` (applies 0019).
2. `core promote brandbase 1.11.0`. No move is new, so no loadout changes.
3. Deploy the core (`fly deploy`, app `brandfactory`): `packages/connect` changed.
4. The web app from this branch (Vercel).
5. Check on Casa Vostra or David's brand: the "+" shows the board ticked, and its ↗ opens it on
   Pinterest; tick a second board, Save, both chips show; remove one with ×.
