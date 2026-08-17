# Phase 1 — Brand profile joins the Registry

Two lists, one nav item, and an invariant that was written down for three releases before it had
a test — and now catches its first real edit.

`Brand profile` moves out of the first unlabelled group, where it sat above Dashboard, and becomes
the **first item of the Registry group, above Outlets**.

---

## 1. Why the registry, and why first in it

The registry is what the business keeps a record of. Every other row in it belongs to something:
an outlet belongs to a brand, a tenancy to an outlet. **The brand belongs to nothing above it**,
which is what makes it the head of that list rather than a peer of Outlets somewhere inside it.

Dashboard is then alone in the unlabelled first group — which is what that group's own docstring
has always said it is for: *"The first group has no label: Dashboard is the home, not a section."*
It was sharing that group with a second item that was not a home.

---

## 2. The move is made twice, and the test is why that is safe

The order lives in **two** places in `components/layout/nav.ts`:

- `NAV_ITEMS` — the declaration, and the only place carrying the comment that justifies each
  adjacency.
- `NAV_GROUPS` — the `hrefs` array `AppSidebar` actually maps over.

Grouping is presentation over the same order: it inserts section eyebrows and does **not**
reorder. So a move made in one place and not the other leaves the rendered nav silently
disagreeing with every comment explaining it, and no typecheck, lint or build can see it.

1.34.1 §1 added the assertion — grouped order equals declared order, filtered to the items the
groups name — one release before anything needed it. This is the edit it was waiting for: moving
only `NAV_GROUPS` fails the suite, which is exactly what it is for.

**Both comments were rewritten rather than carried across.** The old one justified a position that
no longer exists (*"First, above the Dashboard, because…"*), and a comment defending an adjacency
the file does not have is worse than no comment at all. The new one gives the registry argument
above, and keeps the two facts that survive the move: this item is the way *back* to the profile
after the switcher opens it (a radio group reports changes, so re-selecting the current brand does
nothing), and `/brand` is singular on purpose.

---

## 3. The `Sample` tag goes with it

Not a nav decision so much as a consequence of Phase 2, made in the same file: the item no longer
carries a tag, because the screen underneath it reads and writes the brand the server holds.

`NavItem.tag`'s docstring named Brand profile as one of its two examples of a *"real screen
reading placeholder content"*, so it is edited too. Marketing Requests is now the only `Sample` in
the nav, and the docstring says why the other one left — *drop the tag when the data becomes real,
not when the screen looks finished*.

---

## 4. Files

```
src/components/layout/nav.ts        NAV_ITEMS order, NAV_GROUPS, two comments, the tag docstring
src/components/layout/nav.test.ts   the first assertion replaced; five others unchanged
```

`nav.test.ts`'s opening case asserted *"opens on the brand profile"* — `NAV_ITEMS[0]` — which is
no longer true and is no longer the claim worth making. It is replaced by the claim that is: the
Registry group is exactly `["/brand", "/outlets"]`, and the unlabelled group is exactly
`["/dashboard"]`.

---

## 5. Verification

Covered by `pnpm vitest run --project @brandfactory/web-next src/components/layout/nav.test.ts` —
six tests, and the ordering invariant is one of them. The full gate for the release is in
`docs/changelog.md`.

**Not seen in a browser.** The sidebar is behind `AuthBoundary`; see
`brand-profile-editing.md` §7 for what that costs and why it was not worked around.
