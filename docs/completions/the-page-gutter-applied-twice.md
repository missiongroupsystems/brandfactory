# The page gutter, applied twice

An empty table was 32px narrower on each side than the populated one. It was not a spacing
choice on the empty state — it was the page gutter applied twice, once by the view and once by
the state component inside it, on **every list screen in `packages/web-next`**.

`EmptyState`, `QueryError` and `LoadingRows` no longer carry a gutter. The places that render a
state at the *root* of a route ask for one with a new `PageState` wrapper.

No migration, no server change, no wire change, no client behaviour change. `packages/web` is
untouched. Test count **2292 passed | 115 skipped**, unchanged — this package tests auth,
workspace resolution and cache keys, not screens, so nothing here has a unit test to move and
the browser pass is the verification that counts.

Reported from a screenshot of `/influencers` in its empty state.

---

## 1. The shape that landed

```
packages/web-next/src/components/layout/
  query-states.tsx        - the gutter, from all three states; + PageState; + the note on why

packages/web-next/src/app/(app)/
  contracts|dashboard|entities|influencers|licenses|networks|org-chart|outlets|
  registry-brands|review|tenancies|vendors/page.tsx
                          + PageState around each <Suspense> fallback   (12 files)

packages/web-next/src/components/layout/api-ready.tsx        + PageState
packages/web-next/src/features/
  brand-profile/components/brand-profile.tsx                 + PageState (2 sites)
  contracts/components/contract-detail.tsx                   + PageState (2 sites)
  influencers/components/influencer-detail.tsx               + PageState (2 sites)
  licenses/components/license-detail.tsx                     + PageState (2 sites)
  outlets/components/outlet-detail.tsx                       + PageState (2 sites)
  registry-brands/components/brand-detail.tsx                + PageState (2 sites)
  registry/components/org-chart-board.tsx                    + PageState (3 sites)
  tenancies/components/tenancy-detail.tsx                    + PageState (2 sites)
  vendors/components/vendor-detail.tsx                       + PageState (2 sites)
```

23 files, +155 / −79. **Not one list view was edited** — the screens that were visibly wrong are
the ones this change does not touch, because their gutter was always correct and the state inside
them was adding a second.

---

## 2. What was actually wrong

The three states each opened with their own page gutter:

```tsx
export function EmptyState(...) {
  return (
    <div className="px-6 md:px-8">          {/* ← this */}
      <div className="… rounded-xl border border-dashed …">
```

`LoadingRows` did the same with `mx-6 md:mx-8`, `QueryError` with `px-6 pt-2 md:px-8`.

Every list screen already carries the gutter on the block the states render into —
`<div className="flex flex-col gap-4 px-6 pb-8 md:px-8">`, the wrapper in
`influencers-browser.tsx`, `outlets-browser.tsx`, `vendors-view.tsx`, `contracts-browser.tsx`,
`brands-browser.tsx`, `tenancies-view.tsx`, `networks-browser.tsx`, `review-browser.tsx`,
`entities-browser.tsx`, `certifications-view.tsx`, `requests-view.tsx`, `dashboard-view.tsx`,
`licenses-browser.tsx` and the four licence sub-views under it, plus every card that renders a
state inside a detail page.

So the table sat at the gutter and the empty card sat at the gutter **plus the gutter**. On a
1200px window that is 32px on each side — enough that the dashed border visibly steps in from the
header above it and from the table it replaces, and not enough that anybody called it out.

**It is inherited rather than written here.** `query-states.tsx` arrived whole with the
Operations Hub shell in 1.31.0 and the gutter came with it, so the defect has been on screen
through ten releases and every screen added in them. That is the second time a borrowed file's
assumption outlived the borrowing, and it is the argument for reading one before extending it.

The same defect applied to the loading skeleton and the error panel. A reader only ever sees one
of the three at a time, which is exactly why it survived: there was nothing on screen to compare
against.

---

## 3. Which way round the fix goes, and why that was the decision

Both directions close the bug. They fail differently, and that is what chose between them.

| | Failure when somebody forgets |
| --- | --- |
| **Gutter by default, opt out when nested** | The quiet 32px comes back. Nobody sees it. |
| **No gutter, opt in at a route root** | The card goes flush to the window edge. Everybody sees it. |

The second is the one that landed. A mistake that announces itself is worth more than one that
needs a screenshot and a second pair of eyes, which is what this one took.

It also puts the rule where the codebase already keeps it: **the block owns its gutter**, the way
`PageHeader`, `BackLink` and every view wrapper here already do. The state components were the
only things in the package that carried a page-level concern into a component that does not know
what page it is on.

The count was against it, incidentally — roughly twenty nested sites against thirty-two at a
route root, so "gutter by default" is the smaller diff. It was rejected anyway. A default that is
right more often but fails silently is the worse default — and this bug is the evidence, not a
hypothetical: the silent version of it ran for ten releases.

---

## 4. `PageState`, and where the thirty-two sites are

```tsx
export function PageState({ children }: { children: React.ReactNode }) {
  return <div className="px-6 md:px-8">{children}</div>;
}
```

Two kinds of caller, and both were already there before this change — the fix only names them.

**A `<Suspense>` fallback beside a `PageHeader`.** Every list screen is a server page rendering
`PageHeader` with the client browser under `<Suspense>` (AGENTS.md: `useSearchParams` needs the
boundary or the build fails). The fallback renders *before* the browser component and therefore
before its gutter wrapper exists:

```tsx
<Suspense fallback={<PageState><LoadingRows rows={4} /></PageState>}>
  <InfluencersBrowser />
</Suspense>
```

**A detail page's early return.** `outlet-detail.tsx`, `influencer-detail.tsx`,
`contract-detail.tsx`, `license-detail.tsx`, `tenancy-detail.tsx`, `vendor-detail.tsx`,
`brand-detail.tsx` and `brand-profile.tsx` all return a state *above* the `<div className="…
px-6 pb-8 md:px-8">` that holds the record. Five of them return it beside `BackLink`, which
carries a gutter of its own — so before this change the back link and the panel under it agreed,
and after it they still do.

`org-chart-board.tsx` is the odd one: its three states are siblings of the board's gutter div
rather than children of it, so all three take the wrapper.

`api-ready.tsx` renders its error between `PageHeader` and its own gutter block, same shape.

---

## 5. What did not need touching, and the check that says so

**No list view was edited**, which is the property worth stating because it is what makes the
change safe to skim. The nested sites are correct the moment the state stops adding a gutter —
there was nothing to remove from them, because they never had the mistake. `contracts-view.tsx`,
`held-view.tsx`, `library-view.tsx`, `expiring-view.tsx`, `requirements-view.tsx`,
`repairs-view.tsx`, `documents-card.tsx`, `requirements-card.tsx`, `licenses-card.tsx`,
`outlet-tenancy-card.tsx`, `devices-panel.tsx`, `network-panel.tsx` and both extraction reviews
are unchanged files that render correctly now.

`QueryError` keeps a bare `pt-2` where it had `px-6 pt-2 md:px-8`. That 8px is the gap under a
`PageHeader` and is not the gutter; removing it was not part of this and would change vertical
rhythm on the ten surfaces that render an error at a route root.

---

## 6. The trap on the way past: do not run the formatter on this package

`pnpm exec prettier --write 'src/**/*.tsx'` inside `packages/web-next` rewrites **148 files this
change never touched.** The root `format:check` skips this package on purpose — it keeps
upstream's formatting, and its gate is `lint && typecheck && build` with no prettier in it. The
churn was reverted and the diff re-applied by hand; the recorded diff is the change and nothing
else.

Written down here because the failure is silent: lint, typecheck and build all pass over the
churn, and it only shows up as a 174-file `git status` that reads like somebody else's work.

---

## 7. Verification

```
pnpm typecheck                             clean (11 packages)
pnpm lint                                  clean (whole repo)
pnpm format:check                          clean
pnpm test                                  2292 passed | 115 skipped (189 files)
pnpm -F @brandfactory/web build            clean
pnpm -F @brandfactory/web-next lint        clean
pnpm -F @brandfactory/web-next typecheck   clean
pnpm -F @brandfactory/web-next build       clean — static/dynamic split unchanged
```

Re-run in full after the Spaces feature was removed from the package in a separate change, which
deleted `features/spaces/components/workspace.tsx` and the two `/spaces` pages — three sites this
change had wrapped and that no longer exist. Nothing else in it depended on them.

**No browser pass yet.** The stack was brought up for one — Postgres, the API on `:3001`, the Next
dev server on `:3005` — and it stops at the sign-in form, because pasting a bearer token into a
field is not something this agent does. The screenshot that proves the fix is one sign-in away and
is what closes this note.

---

## 8. What is deliberately not done

- **The gutter is not moved to `app/(app)/layout.tsx`.** One gutter for the whole shell would
  delete the class from `PageHeader`, `BackLink` and twenty-six view wrappers, and it would have
  to answer for the surfaces that are deliberately full-bleed. That is a layout decision with its
  own plan, not a rider on a bug fix.
- **No `PageBody` component.** The twenty-six wrappers still write
  `flex flex-col gap-4 px-6 pb-8 md:px-8` out by hand. Extracting it is the right next step and is
  the same decision as above, one size smaller.
- **`QueryError`'s `pt-2` stays.** See §5.
- **No test.** There is nothing here a jsdom assertion would catch that the eye does not, and
  asserting a Tailwind class string pins the implementation rather than the behaviour. This
  package's test policy is explicit about which half it covers.
