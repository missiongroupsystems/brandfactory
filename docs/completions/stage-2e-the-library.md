# Stage 2E — the library, and turning the tile on

**Status:** shipped, 2026-07-29. Executes Stage 2E of
[`docs/executing/brand-hub-implementation.md`](../executing/brand-hub-implementation.md),
on top of [2D](stage-2d-the-logo.md).

**No migration, no new route.** `Visual identity` stops being a `Soon` tile and
becomes the surface that *owns* a brand's assets: upload, link, palette editing,
promote-to-mark, delete.

**Plus one dev-environment fix the live pass forced**, described in full below:
browser uploads have failed on a CORS preflight since 0.7.4, silently, because
Vite proxies `/api` and `/rt` but not `/blobs`.

Test baseline: **681** (652 passed, 29 skipped) → **694** (665 passed, 29
skipped). **+13**.

---

## The bug the live pass found, again, and this one is four versions old

The drop zone's first real file produced a toast — `Could not add casa-mark.svg`
— while the same three-step flow succeeded from `curl`. The browser said why:

```
Access to fetch at 'http://localhost:3001/blobs/…' — net::ERR_FAILED
```

`scripts/dev.sh` has claimed since Phase 8 that

> Vite boots on :5173 with a proxy (`/api` → :3001, `/rt` → :3001) so the
> browser sees a single origin and no CORS setup is needed in dev.

**That is true for `/api` and `/rt`, and false for the one path that carries
bytes.** `BLOB_PUBLIC_BASE_URL` points at `http://localhost:3001/blobs`
absolutely, so every blob URL opts back out of the single origin the proxy
exists to create. Reads never noticed — an `<img src>` is not CORS-gated, which
is exactly why 2D's signed-URL work went through cleanly — but `uploadBlob`
PUTs with `fetch`, which preflights, and `CORS_ALLOWED_ORIGINS` is deliberately
unset in dev.

**`uploadBlob` is the same function the canvas drop zone has used since 0.7.4.**
So this is not a 2E regression; it is 2E being the first pass to actually put a
file through it in a browser.

The fix is three lines of configuration and no application code:

```
vite.config.ts     '/blobs' → :3001, no rewrite
.env.example       BLOB_PUBLIC_BASE_URL=/blobs      (absolute stays documented
.env               BLOB_PUBLIC_BASE_URL=/blobs       for split-origin deploys)
scripts/dev.sh     the comment now names /blobs, and says why it matters
```

### Verified by isolating it, not by asserting it

The mechanism was proved from inside the browser, both directions, against the
same signed key:

```
PUT → http://localhost:3001/blobs/…  (absolute, today)   THREW: Failed to fetch
PUT → /blobs/…                       (proxied, relative) 200
```

and the proxy itself serves the bytes with 2D's content type intact:

```
GET :3001/blobs/…    200 image/svg+xml
GET :5173/blobs/…    200 image/svg+xml     ← through the new proxy
```

**The one thing not yet observed is a file going through the real drop zone**,
because the running dev server reads `.env` at boot and had not been restarted
when this pass ended. Everything either side of it is verified; the gap is a
process restart, not an unknown. See Caveats.

---

## Turning the tile on, and the count that would have lied

`visual.enabled` flips to `true` — the first edit to `miniApps.ts`, which 1.8.0
was explicitly forbidden from making because a `true` there turns the tile on
for **every real brand**.

Flipping it surfaced something the plan did not mention. `MiniAppTile` renders a
thread count, and `showCount` is gated on `enabled` — so the moment the tile went
live it would have read **`0 threads` on every brand**, which is not merely
unhelpful but false: the page behind it has no threads to have. The registry now
says what each row is a collection *of*:

```ts
unit: 'thread' | 'asset'
```

`Visual identity` is the first row that is not a category of threads. `create`
and `match` stay on it so a legacy `templateId: 'visual'` thread is still
*classified* — and so never lands in the hub's "we don't know what this is"
catch-all — but nothing creates one, and the tile now reads `4 assets`.

The route splits to match: `MiniAppPage` resolves the row, and dispatches to
`ThreadListPage` or `VisualIdentityPage`. Separate components rather than
branches, because each owns different queries and neither should pay for the
other's.

## Still a pure view, which is what kept the demo alive

Every write is a **callback prop** on `AssetLibraryView`, and every affordance
renders nothing when its callback is absent. `VisualIdentityPage` owns the
queries and the mutations. That is the same seam 1.8.0 drew, and it is why
`routes/demo.brand.assets.tsx` still renders this component against fixtures
with no QueryClient — the plan's claim that *"`AssetLibraryView` was built to
outlive the mockup"* held, and its layout did not change.

The invariant has its own test: given no callbacks, no intake zone, no delete,
no add row — and the read-only palette list still there, because reading never
needed a callback.

**`useSignedReadUrls` is what let the view stay pure.** A grid needs one signed
URL per blob, each on its own 4-minute re-sign, and a component cannot call
`useSignedReadUrl` in a loop. `useQueries` takes a dynamic array; the page builds
a `key → url` map and passes a plain `resolveBlob` function, so the view never
learns that a URL expires.

## Decisions inside the editing surface

- **The swatch ramp and the editable rows are both rendered.** Two views of one
  list: the ramp is how a palette is *read* (all twelve at a glance), the rows
  are how it is *changed*. Replacing the ramp with the rows would have cost the
  reading view to buy the editing one.
- **A label commits on blur, not per keystroke.** A PATCH per character is write
  amplification the row does not need, and there is a test that typing alone
  writes nothing.
- **`status` toggles in one click**, because a brand mid-decision having floated
  colours is the whole reason the column exists — not a state to bury in a menu.
- **Reorder is N patches, not one call.** `reorderAssets` exists in the db layer
  and has no route; 2B declined to ship one with no caller. Dragging one swatch
  moves a handful of rows, and the batch route is already written underneath if a
  palette ever outgrows that.
- **Uploads are sequential, not `Promise.all`.** The server appends `position` by
  reading the current maximum, so N concurrent creates of one kind would race
  onto the same number — and ordering is the thing the user sees.
- **`Add link`, not `Add`.** The live pass tripped over the ambiguity first (a
  name query matched both it and `Add colour`), and a button announced as just
  "Add" is the same problem for anyone tabbing through.

## Question 3, settled by looking

The `Visual guidelines` text section **survives** alongside the swatches, as the
mockup's screenshots argued: the section holds *rationale*, the swatches hold
*values*, and a colour ramp cannot carry a reason. `SUGGESTED_SECTIONS` keeps the
row — but its example body, which read *"Primary palette: neutral-first, one
accent…"*, is rewritten. It was prompting the user to type colours into prose at
the exact moment a control exists for them; it now prompts for the half only
prose can hold (*"the tiled floor, the awning at dusk, the wine list"*), and the
description points at Visual identity for the rest.

---

## Verification

```
pnpm typecheck                             9/9 workspaces
pnpm lint / format:check                   clean
pnpm test                                  665 passed | 29 skipped (694)
pnpm --filter @brandfactory/web build      ok · grep -c demo dist → 0
```

### The live pass

Vite only, against the already-running dev server. Both themes, 1600×1000, no
console or page errors.

| check | result |
| --- | --- |
| Hub tile | reads **`4 assets`**, not `0 threads` |
| Rail `Palette` heading | now a **link** — the 2C gate opened when `enabled` flipped |
| Hub → tile → library | navigates, breadcrumb reads `Visual identity` |
| A blob thumbnail | renders, through `useSignedReadUrls` |
| A Drive share URL | **refused inline**, with 2D's copy, and the URL survives in the field |
| Rename a colour | committed on blur, persisted |
| Toggle to `proposed` | persisted — summary went `4 colours` → `4 colours · 1 proposed` |
| Add a colour | persisted |
| Vite `/blobs` proxy | `200 image/svg+xml`, matching :3001 |
| Same-origin `PUT` | **200**; the absolute one throws, as diagnosed |

Everything seeded was deleted afterwards, including two probe blobs that were
PUT but never registered as assets. The dev database is back to its three brands
and zero asset rows; `packages/server/.data/blobs` is empty.

### Where the +13 tests went

| file | Δ | what it pins |
| --- | --- | --- |
| `AssetLibraryView.test.tsx` | +13 | the absent-callback invariant · blur-committed rename and the two no-write cases · status toggle · delete by name · add-colour gated on a name · the ramp surviving beside the rows · the add row for a brand with no colours · the link refusal rendered inline with the URL intact · the field clearing on success · dropped files reaching the caller · the picker disabled mid-upload · promote and demote a mark |

**Four existing test bodies changed**, all for the registry flip: `MiniAppTile`
and the mini-app route used `visual` as their stand-in for *a disabled app*, and
it is not one any more — `social` is. Those cases are about disabled-tile
behaviour, not about which app happens to be disabled, so the substitution is the
whole change. `BrandHubView`'s palette-link pair inverted for the same reason:
the default is now the linked case, and the gate is asserted by passing a
registry with the tile off.

**One prop changed shape**: `BrandHubView` took `colors` in 2C and takes `assets`
now, deriving the palette itself. 2E needs the total for the tile count, and two
props would have made "the palette knows but the tile does not" a representable
state that means nothing.

---

## Caveats

- **A file has not gone through the real drop zone in a browser.** The fix is
  verified on both sides — the proxy serves, a same-origin PUT returns 200, the
  cross-origin one throws — but the running dev server still mints absolute URLs
  because it reads `.env` at boot and was not restarted before this pass ended.
  **Restart the server and re-run the drop zone; it is a one-minute check.**
- **`.env` was edited** (one line, `BLOB_PUBLIC_BASE_URL=/blobs`) so the
  documented dev flow works. Reverting it re-breaks uploads; it is not a secret
  or a deploy value.
- **Split-origin deploys are unaffected and untested here.** They need the
  absolute form plus `CORS_ALLOWED_ORIGINS`, which is what `.env.example` now
  says. Nothing in this pass changed that path, and nothing exercised it.
- **No `alt` editing.** The column exists (2A, finding 2) and the library renders
  it as the thumbnail's alt with a `label` fallback, but nothing sets it. The
  natural home is a per-asset detail affordance this page does not have yet.
- **Delete has no confirmation.** It is a soft delete and recoverable at the row
  level — but there is no UI to recover it, so in practice a misclick is a
  disappearance. Worth a look in 2F.
- **No keyboard walk, no reduced-motion pass**, and the dnd-kit keyboard sensor
  is wired but unexercised. Standing debt.
- **The 900px rail is still owed** — 2F's "third pass; fix it".

**Untouched:** `packages/db`, `packages/agent`, `adapters/*`, the migration set
(still 0004), and `docs/changelog.md`. `packages/server` is untouched by this
pass; `packages/shared` changed only the one `exampleBody`.

**Next in the plan:** 2F — verification and the live pass for the stage as a
whole, the 900px rail, deleting `demo.brand.assets.tsx`, and the 1.10.0 release.
