# Stage 2C — colours in the real hub

**Status:** shipped, 2026-07-29. Executes Stage 2C of
[`docs/executing/brand-hub-implementation.md`](../executing/brand-hub-implementation.md),
on top of [2A](stage-2a-brand-assets-schema.md) and [2B](stage-2b-brand-assets-routes.md).

**No migration, no new route.** The first UI of Stage 2: `useBrandAssets`, the
brand hub feeding `colors` for real, and the deletion of the two palette
arrangements the 1.8.0 mockup built in order to have them deleted.

**Read-only, and colours are still API-seeded only.** Adding, labelling and
reordering live on the Visual identity page, which 2E builds; the tile is still
`Soon`. So for one phase a brand can *display* colours it cannot yet *add* —
deliberate, and the reason Stage 2 releases at 2F rather than here.

Test baseline: **640** (611 passed, 29 skipped) → **652** (623 passed, 29
skipped). **+12**, all in `packages/web`.

---

## What the mockup was for, discharged

1.8.0 built the palette three ways — a rail block (A), under the mark (B), on
the Visual identity page only (C) — and said plainly that *two of them being
deleted is the deliverable*. This is that deletion.

```
BrandContextRail   RailVariant type            deleted
BrandIdentity      `colors` prop + swatches    deleted   (structure B)
BrandHubView       railVariant prop + branch   deleted
demoParams         the `rail` knob             deleted
DemoBar            the rail <select>           deleted
```

**A survives.** The reasoning is the plan's and is not reopened here; what this
pass adds is that the surviving arrangement is now the *only* one, so a prop with
one legal value is gone rather than defaulted.

`ColorSwatches` is untouched and keeps every test it had — which is the evidence
that this was a deletion of arrangements, not a rewrite of the thing arranged.

## The invariant, half retired again

1.8.0's protection was that the real route could only pass `null` for every prop
the mockup added. 1A retired that for `websiteUrl`; **2C retires it for
`colors`**. The surviving half is what carries the weight, and it is now about
runtime states rather than a construction:

> Every affordance still renders nothing when its prop is absent — and "absent"
> is a real runtime state, because a query can be pending, empty, or failed.

`undefined` and `[]` are **different states with the same rendering**, and the
route is explicit about it:

```ts
const colors =
  assetsPending || assetsError || assets === undefined ? undefined : assetsOfKind(assets, 'color')
```

- `[]` — the brand has no colours. No block, and **no placeholder saying so**. A
  brand with an empty palette is a legitimate brand (`vision.md:28`); a "no
  colours yet" box is the scolding 1.7.0 spent a pass removing.
- `undefined` — not known. Same silence, different reason: a palette block that
  flashes empty on every navigation is worse than one that appears 100ms late.

Both have tests, and the pending one was also **measured in a browser** rather
than reasoned about — see below.

## The link that would have been dead

The plan says the palette block's heading becomes a link to Visual identity.
Checked against what that route actually renders today: it is a **`Coming soon`
stub** until 2E flips `visual.enabled`. A link from the one surface that shows
you your colours to a page that says "later" is the dead affordance 1.7.0 spent
a pass removing — and the plan itself holds the no-link option open.

So the link is **gated on the destination existing**, the same way 1.8.0 gated
the research row on its callback:

```tsx
const visualHref = tiles.find((a) => a.id === 'visual')?.enabled
  ? `/brands/${brand.id}/apps/visual`
  : undefined
```

The registry is the single place that knows, `tiles` is already a prop, and 2E's
`enabled: true` turns the heading into a link with **no edit to either
component**. Both states have a test, and the enabled one was verified live on
the demo route (which already enables `visual`): `href="/brands/b-demo/apps/visual"`.

## The cache contract

`applyAssetToCache` is exported standalone, the same shape as
`applyGuidelinesToCache`, so the contract is testable without standing up a
mutation. Three decisions are written into it:

- **A soft-deleted row leaves the list** rather than sitting in it with a
  `deletedAt` every renderer would have to remember to filter. The server's read
  path drops it, so the cache agrees with a refetch instead of diverging until
  one happens.
- **An unseeded cache stays unseeded.** Writing a mutation response into an
  `undefined` list would make the rail render a one-colour palette for a brand
  whose real palette is still unknown, then swap it a moment later. The
  mutation's response is not a substitute for the query.
- **Only one cached copy exists**, unlike guideline sections, which are embedded
  in `ProjectDetail` too and so need the two-place patch. Assets are not in any
  project payload — deliberately, since they are not in the agent's context.

`brandKeys.assets(id)` nests under `brandKeys.detail(id)`, so `useDeleteBrand`'s
existing `removeQueries` sweeps the asset list with the brand. That is a property
of the key shape rather than of code someone could edit away, and it has a test
that says so.

---

## Verification

```
pnpm typecheck                             9/9 workspaces
pnpm lint / format:check                   clean
pnpm test                                  623 passed | 29 skipped (652)
pnpm --filter @brandfactory/web build      ok
grep -c "demo" dist/assets/*.js            0
grep -ci "casa vostra|terracotta"          0
```

### The live pass, and what it took to make it real

**Colours can only be seeded through the API in 2C**, which is exactly what makes
this pass worth running: three brands were created against the real server —
two proposed primaries, a twelve-colour ramp with one still floated, and a bare
brand — plus one `link` image on the ramp brand, to prove the rail shows colours
and nothing else.

Playwright was installed **outside the repo** (`package.json` and
`pnpm-lock.yaml` unchanged, as in 1A/1B). The app ran on the **already-running
dev server**; only Vite was started, on its own standard port. 10 screenshots —
5 states × light/dark at 1600×900 and 900px — no console or page errors.

| observed | result |
| --- | --- |
| `bare` | no palette block, no placeholder; section list straight into `Talk it through` — **byte-identical to 1.7.0** |
| two proposed primaries | `2 colours · 2 proposed`, both dashed; reads as a brand in progress, not a broken one |
| twelve colours | wraps to two rows in the 80-wide rail, `12 colours · 1 proposed`; the `link` image is correctly absent |
| `Palette` heading | plain text on the real registry; a **link** on the demo, where `visual` is enabled |
| dark mode | swatch borders and dashed outlines both hold |

**The pending state was measured, not reasoned about.** The assets response was
held for 2.5s with a route interceptor while brand and projects resolved
normally:

```
Palette headings mid-flight: 0   (must be 0)
Palette headings after load: 1   (must be 1)
```

That check found a fault in *itself* first — `text=Palette` also matches the
brand named "Palette Full" and the switcher pill, so the first run reported 2 and
3. The role-based locator is the honest one.

Everything seeded was deleted afterwards; the dev database is back to zero
`brand_assets` rows and its three brands, and the Vite process was stopped.

### Where the +12 tests went

| file | Δ | what it pins |
| --- | --- | --- |
| `api/queries/assets.test.ts` | +9 (new) | append, replace-in-place, soft-delete drops out, no-op for an uncached delete, **unseeded cache stays unseeded**, empty list is writable, no cross-brand write, no input mutation, and the key-prefix sweep |
| `BrandHubView.test.tsx` | +3 net (+5 new, −2) | exactly one palette and it is in the rail · pending and empty both render nothing · heading unlinked while `visual` is disabled · linked once enabled |
| `BrandIdentity.test.tsx` | 0 net (+1, −1) | structure B is gone: no palette under the mark |
| `demoParams.test.ts` | 0 net | one knob; a stale `?rail=` deep link still resolves |

**Three test bodies changed**, all of them tests *of the deleted variants* — the
two that asserted A-vs-B placement and the one that asserted the band's swatches.
Deleting the behaviour is the phase; leaving its tests asserting it would be the
bug.

---

## Judgement calls this pass made

- **The palette heading link is gated on `visual.enabled`.** The plan specified
  the link unconditionally and separately noted the tile is still `Soon` in 2C;
  those two together would have shipped a link to a "Coming soon" page. Gating
  reconciles them and costs 2E nothing.
- **The route derives `colors` with `assetsOfKind`, not a server filter.** The
  assets endpoint returns everything; the hub wants colours. Filtering client-side
  keeps one endpoint and one cache entry for 2D's logo and 2E's library, which
  read the same list.
- **`applyAssetToCache` over `invalidateQueries`.** The server appends by
  position, so the returned row already carries the ordering decision; a refetch
  would produce the same list one round trip later.

## Left for later, named rather than buried

- **The 900px rail is still not fixed, and 2C narrowed what is wrong with it.**
  Stacked full-width, a *section row* is ~830px with its `+` at the far end —
  that is the 1.7.0/1.8.0 debt. The **palette block is the best-behaved row in
  that column**: swatches left, count right, no stretched hit area. So 2F's
  "third pass; fix it" is about the section list, not the thing this stage added.
- **`writeDemoParams` preserves an unknown `?rail=`** rather than stripping it.
  Harmless — the app ignores it and the page renders — and leaving unknown query
  params alone is the more conservative behaviour.
- **No keyboard walk and no reduced-motion pass.** Both themes were shot; focus
  order was not. Same debt 1.8.0 and 1A logged.
- **Nothing displays a colour's `role`.** `primary` is stored, ordered and
  read-back, and the rail shows only value and status. Where role surfaces is a
  2E question, with the editor that sets it.
- **The agent still cannot see a brand's colours.** Assets are deliberately not
  in `ProjectDetail` and not in the system prompt. Unchanged by this pass and not
  in the plan before Stage 3.

**Untouched:** `packages/shared`, `db`, `server`, `agent`, `adapters/*`, the
migration set (still 0004), `miniApps.ts` (2E flips `visual.enabled`),
`ColorSwatches.tsx`, and `docs/changelog.md` — Stage 2 ships as 1.10.0 at 2F.

**Next in the plan:** 2D — the logo. `logoAsset` → `assetUrl` → `BrandMark src`,
`blob` through `useSignedReadUrl`, and record-time link validation.
