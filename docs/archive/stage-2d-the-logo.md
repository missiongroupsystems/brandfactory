# Stage 2D — the logo

**Status:** shipped, 2026-07-29. Executes Stage 2D of
[`docs/executing/brand-hub-implementation.md`](../executing/brand-hub-implementation.md),
on top of [2C](stage-2c-colours.md).

**No migration, no new route.** `BrandMark`'s own doc comment has promised this
since 1.7.0 — *"only the source of the fill changes from derived to declared"* —
and this is the pass that makes it true.

**Plus one server fix the live pass forced**, outside the phase's nominal scope
and described in full below: stored blobs were served as
`application/octet-stream`, which browsers sniff past for PNG/JPEG and **never**
for SVG. An uploaded SVG logo silently fell back to the monogram.

Test baseline: **652** (623 passed, 29 skipped) → **681** (652 passed, 29
skipped). **+29**.

---

## The bug the live pass found, and why no test would have

The first screenshot run reported this:

```
logo-blob        img=false text="LB"     ← the declared mark did not render
logo-link-dead   img=false text="LL"
logo-proposed    img=false text="LP"
no-logo          img=false text="NL"
```

Every request in the chain returned **200** — the assets list, the signed
read-url mint, and the image itself. The bytes on the wire were valid SVG. The
mark still rendered the monogram.

```
content-type: application/octet-stream
```

`packages/server/src/routes/blobs.ts` hardcoded that, with a comment saying so:

> *Content-type persistence is a Phase 8 polish (plan task 4); the Phase 4
> default keeps uploads honest without a schema change.*

Phase 8 shipped without it. **It stayed invisible for four minor versions
because browsers content-sniff PNG, JPEG, GIF and WebP for an `<img>` regardless
of the declared type** — so canvas image blocks, which have uploaded and
rendered images since 0.7.4, always worked. **SVG is never sniffed.** It requires
the exact `image/svg+xml`, and it is the single most likely format for a logo.

The failure mode is the one this stage's own finding is about: `onError` fires,
the monogram takes over, and the result is **pixel-identical to a brand with no
logo**. The feature reports success and shows you nothing.

**No unit test would have caught it.** jsdom does not fetch `<img src>`, so the
component tests that assert the fallback pass in both worlds; the route test
asserted the bytes and not the header. It took a real browser against real
storage, which is the argument for the live pass in one example.

### The fix, and the part of it that is not "the Phase 8 polish, late"

Content type is derived from the key's extension, against an **allowlist**:

```ts
jpg jpeg png gif webp svg pdf   → the real type
anything else                    → application/octet-stream
```

From the extension rather than a persisted value because **there is nothing
persisted to read**: `local-disk`'s `put` accepts a `contentType` option and
discards it, so every blob written before today has no stored type. The upload
path already appends the original filename to the server-minted key, so the
extension is there.

The list is deliberately a *subset* of `ALLOWED_UPLOAD_MIMES`: `text/plain` and
the two Word types are downloads, not things a browser should render inline from
user bytes.

**And the two headers that make declaring a real type safe:**

```
content-security-policy: default-src 'none'; sandbox
x-content-type-options: nosniff
```

`/blobs` is same-origin with the app in the single-origin dev and
minimal-deploy setups, and **an SVG is a document**. Served as `image/svg+xml`
and *navigated to directly*, a `<script>` inside user-uploaded bytes would run in
the app's origin. It cannot run inside the `<img>` `BrandMark` renders — but the
URL is one paste away from a tab. The sandbox and the null `default-src`
neutralise it; `nosniff` closes the other direction. Going from octet-stream to
a real type without these would have traded a broken feature for a stored XSS.

---

## `useAssetUrl`, and why neither half could live in `shared`

```ts
const blobKey = asset?.source === 'blob' ? asset.blobKey : null
const { data: signedUrl } = useSignedReadUrl(blobKey)
```

This is `assetUrl` with the blob resolver finally wired up. A `blob` resolves
through a signed read URL that **expires in five minutes**, and
`useSignedReadUrl` re-signs on a 4-minute interval for as long as the image is
mounted — so a URL minted server-side, or once at render, is stale before the
page has been open a lunch break. There is a test that a re-sign reaches the
consumer, because a page left open would otherwise render a mark that 403s on
the next repaint.

The hook is called unconditionally with a `null` key for non-blob sources, since
hooks cannot be conditional and `useSignedReadUrl` is already
`enabled: !!blobKey`.

**A pending blob returns `null`, not `''`.** An `<img src="">` resolves against
the current document and then fails, so the mark would flicker through a broken
image on every load. `null` means the caller renders exactly what it renders
with no asset at all.

## One monogram, four ways to reach it

The plan says the monogram is the fallback for three things. In the shipped path
there are **four**, and they must be one state on screen rather than four that
happen to look similar:

| | resolves to |
| --- | --- |
| no logo asset | `logoAsset` → `null` |
| a **proposed** logo | `logoAsset` filters on `status === 'active'` → `null` |
| a blob whose signed URL has not arrived | `useAssetUrl` → `null` |
| a `src` that fails to load | `BrandMark`'s `onError` |

The first three are literally `src == null`, so the only one that could diverge
is the failure path — and the test compares **rendered markup**, not two
separate assertions:

```
render(<BrandMark … />)                    → html
render(<BrandMark … src="/dead.png" />)    → fireEvent.error → same html
```

Confirmed live: all four states measured at a 56×56 box, and the three
fallbacks all showing initials.

## Record-time link validation

`lib/image-url.ts` — `probeImageUrl(url)`, which the plan schedules here and 2E's
paste-a-URL form consumes. It is a **tested pure primitive one phase ahead of its
caller**, which is a different thing from 2B's declined reorder route: a route is
a public surface to maintain, a function is not, and the plan says explicitly
that 2E shares *2D's* validation.

Three decisions are in it:

- **An `<img>`, not a `fetch`.** The question is exactly "will the tag we are
  about to render succeed". A `fetch` answers a different one — it is subject to
  CORS, so a perfectly good hotlinked image on a host without
  `Access-Control-Allow-Origin` would be refused. An `<img>` has no such
  restriction, which is why hotlinking works at all.
- **A timeout is required, not defensive.** A host that blackholes the request
  fires neither `load` nor `error`, so without it the form's save button stays
  disabled forever with no explanation — the failure that looks like a broken app
  rather than a bad URL. A late response cannot flip a settled verdict; the probe
  detaches its handlers, and there is a test.
- **The copy tells and stops.** The assets proposal lists share-URL rewriting as
  a non-goal, so nothing turns a Drive link into `?raw=1`. An `<img>` error event
  carries no status, no content type and no message by cross-origin design, so
  the copy names the overwhelmingly likely cause and offers both real ways out
  rather than inventing a diagnosis. A test asserts it promises no magic fix.

---

## Verification

```
pnpm typecheck                             9/9 workspaces
pnpm lint / format:check                   clean
pnpm test                                  652 passed | 29 skipped (681)
pnpm --filter @brandfactory/web build      ok · grep -c demo dist → 0
```

### The live pass

Playwright outside the repo; **only Vite was started**, against the dev server
already running. A real 249-byte SVG mark was uploaded through the real two-step
transport — `POST /blob-urls/upload-url` → `PUT` the bytes — and four brands were
seeded to cover every path.

| state | before the fix | after |
| --- | --- | --- |
| `logo-blob` (uploaded SVG) | monogram — **the bug** | the mark renders |
| `logo-link-dead` | monogram | monogram, no broken-image artifact |
| `logo-proposed` | monogram | monogram (`logoAsset` filters it) |
| `no-logo` | monogram | monogram |

8 screenshots, both themes, no console or page errors. **All four marks measured
56×56** — the geometry claim, checked rather than asserted.

**A bonus verification fell out of the cleanup.** Deleting the four brands left
`packages/server/.data/blobs` with **zero files**: the uploaded SVG was swept by
the brand cascade, which is 2A's widened `listBlobKeysByBrand` proven end-to-end
against real storage rather than a fake. The dev database is back to its three
brands and zero asset rows.

### Where the +29 tests went

| file | Δ | what it pins |
| --- | --- | --- |
| `lib/image-url.test.ts` | +10 (new) | the scheme gate refuses `javascript:`/`data:`/relative **without probing** · load accepted · error refused with the named copy · the timeout · a late response cannot flip a settled verdict · the copy promises no rewrite |
| `api/queries/useAssetUrl.test.tsx` | +7 (new) | null asset · colour → null · link passthrough with no request · **pending blob → null, not `''`** · the resolved URL · a re-sign reaching the consumer · keyed per blob key |
| `server/routes/blobs.test.ts` | +10 | four extensions → four types · five non-renderable keys stay octet-stream · the sandbox CSP and nosniff |
| `components/brand/BrandMark.test.tsx` | +2 | absent and failed render **identical markup** · `null` src is the same as no src |

**No existing test body changed.**

---

## Judgement calls this pass made

- **The blob content-type fix is in scope.** It is a `packages/server` change in a
  `packages/web` phase, which widens the pass — but 2D's deliverable is "an
  uploaded logo renders", and without it the feature fails for the commonest logo
  format, silently, in exactly the way this stage's own finding is about.
- **Extension-derived, not persisted.** Persisting the content type is the more
  correct fix and needs a storage-format change plus a fallback for every
  existing blob — which would be the extension anyway. Flagged below.
- **CSP + nosniff shipped with it**, rather than as a follow-up. Declaring real
  content types for user bytes without them is a worse position than the bug.
- **`probeImageUrl` ships before its caller.** The plan structures it that way and
  a pure function is not a maintained surface.

## Left for later, named rather than buried

- **`local-disk`'s `put` still discards its `contentType` option.** The signature
  invites persistence that does not happen, which is how this bug was born. The
  honest follow-up is either to persist it (sidecar or a `blobs` table) or to
  delete the parameter; the extension fallback is needed either way for existing
  blobs.
- **Supabase Storage is unverified for this.** It stores and serves content type
  itself, so the hosted path is very likely already correct — but this pass ran
  against `local-disk` only and did not check.
- **Nothing sets a logo yet.** Assets are still API-seeded; 2E builds the library,
  the drop zone and the paste-a-URL form that calls `probeImageUrl`.
- **`BrandMark` is still only on the hub.** `BrandCard` and the switcher render no
  mark, so a declared logo does not reach the workspace grid. Not in the plan;
  worth a look in 2F now that a logo exists.
- **No keyboard walk, no reduced-motion pass.** Same standing debt.

**Untouched:** `packages/shared`, `db`, `agent`, `adapters/*` (the storage port's
signature is unchanged), the migration set (still 0004), `miniApps.ts`, and
`docs/changelog.md` — Stage 2 ships as 1.10.0 at 2F.

**Next in the plan:** 2E — the library, and turning the tile on. `visual.enabled`
flips, `AssetLibraryView` moves from fixtures to query data, the real drop zone
replaces the inert one, and palette editing lands.
