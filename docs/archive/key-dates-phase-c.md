# Phase C — the preference and the menu

**Status:** complete, 2026-08-06. Written against `main` at **1.22.1** + Phases
A–B (1567 passed | 68 skipped before this phase; the skips are the live-Postgres
suites).

Executes Phase C of
[`docs/executing/key-dates-implementation-plan.md`](../executing/key-dates-implementation-plan.md),
following [Phase A](key-dates-phase-a.md) and [Phase B](key-dates-phase-b.md).

**No migration, no route, no wire type, no server code.** The control exists and
remembers, mounted nowhere. 4 files added, 0 modified, +21 tests. This is the
last dark phase.

---

## 1. What was built

**`lib/key-dates-prefs.ts`** — `getEnabledSets(brandId)` / `setEnabledSets(
brandId, sets)` over `bf_key_dates_${brandId}`, storing a comma-joined list.
`sidebar-prefs.ts`'s shape verbatim, including its swallowed failure: a private
browsing window that blocks `localStorage` gets the default, never a crash.

**`components/brand/KeyDatesMenu.tsx`** — pure. `enabled` in, `onChange` out,
three `DropdownMenuCheckboxItem`s, each a swatch, a label and a description.
No new primitive, no new dependency.

## 2. C2 — reading validates rather than casts, and the shape that does it

The task says unknown members must be dropped. The obvious implementation
filters the *stored* strings and casts what survives:

```ts
raw.split(',').filter(isKeyDateSet)          // needs a type guard, and a cast
```

The implementation filters the **declared** sets by what was stored instead:

```ts
const stored = new Set(raw.split(','))
return KEY_DATE_SETS.filter((set) => stored.has(set))
```

Three properties fall out of that one line, and none of them needed asking for:

- **Validation is structural.** An unknown member never matches, so it cannot
  reach the output. There is no type guard and no `as KeyDateSet` anywhere in
  the module — the return type is `KeyDateSet[]` because it is literally a
  filtered `KEY_DATE_SETS`.
- **The order is canonicalised.** A hand-edited `sg-events,global` comes back as
  `['global', 'sg-events']`, so the menu's count, the selectors and the stored
  value cannot disagree about what one selection looks like.
- **Duplicates collapse**, because the input is a `Set` lookup over a distinct
  list.

A first draft carried an `isKeyDateSet` type guard beside this and it was
deleted: filtering a list that is already `readonly KeyDateSet[]` cannot produce
a non-set, so the guard was checking a thing the array's own type had already
established.

### The three cases, and the one that is not obvious

| Stored | Returned | |
| --- | --- | --- |
| no key | `DEFAULT_ENABLED_SETS` | never touched |
| `"global,sg-events"` | `['global', 'sg-events']` | the ordinary case |
| `""` | `[]` | **switched everything off** |

The third is the one worth a test of its own. "Never chosen" and "chose nothing"
are different states, and collapsing them would hand the default back to a user
who deliberately cleared the menu — making it look broken on every reload. An
empty string is a real answer, and `raw === ''` is checked before anything else
splits it.

### The default is copied, not returned

`getEnabledSets` returns `[...DEFAULT_ENABLED_SETS]`. Returning the module
constant would let one caller's `.push` rewrite the default for every brand in
the session — a bug that shows up as the *second* brand you open having the
wrong sets on. There is a test for it.

## 3. Decisions the plan left to the implementation

### The trigger's accessible name says what the number counts

C4 asks for `Key dates` with a count. Rendered as a bare numeral the accessible
name becomes *"Key dates 1"*, which is a count of nothing in particular.

So the visible label keeps the numeral and the button carries
`aria-label="Key dates, 1 of 3 on"`. The visible string stays inside the
accessible name, which is WCAG 2.5.3's requirement and the reason the label is
not something more inventive. With no sets on there is no `aria-label` at all —
the accessible name is just the visible text, which is already correct.

### The menu stays open on a pick

`onSelect={(e) => e.preventDefault()}` on each item. Switching on both Singapore
sets is one gesture rather than three, which matters because the menu is the
only place these live.

This is the *opposite* of `EntityMenu`'s decision, and deliberately so: that
menu's items open a dialog, so leaving it mounted would produce two live focus
scopes. A checkbox item mutates state in place and opens nothing, so there is no
second scope to collide with. Both behaviours are correct for their own menu,
and the reasoning is written at each.

### Toggling rebuilds rather than splices

`toggle` builds a `Set`, adds or deletes, then filters `KEY_DATE_SETS` — the
same expression `getEnabledSets` uses. Pushing onto `enabled` would emit
`['sg-events', 'global']` from a menu whose storage reader would have returned
`['global', 'sg-events']`, so a toggle and a reload would produce two different
arrays for one selection. A test pins the canonical order coming out of the
menu, not just out of storage.

### The description line is a row, not a longer label

*Singapore holidays* does not tell you Thaipusam and the Hungry Ghost month are
inside, and no label short enough for a menu row would. The second line carries
it. This is `KEY_DATE_SET_DESCRIPTIONS` from Phase A finally reaching a screen.

## 4. The files

| File | |
| --- | --- |
| `lib/key-dates-prefs.ts` | **new** — the two functions |
| `lib/key-dates-prefs.test.ts` | **new** — 12 tests |
| `components/brand/KeyDatesMenu.tsx` | **new** — the control |
| `components/brand/KeyDatesMenu.test.tsx` | **new** — 9 tests |

## 5. What the 21 tests hold

The plan budgeted ~10. The extra eleven are mostly the prefs module, where each
branch is cheap and each is a distinct failure a user would meet.

**The empty-string case, both directions** — `setEnabledSets(id, [])` writes
`''`, and `getEnabledSets` reads `''` back as `[]` rather than the default.

**A blocked `localStorage` on read *and* on write.** Read returns the default;
write is a no-op that does not throw, so the toggle still works for the session
and simply does not survive a reload.

**Brands stay independent** — `brand-1` set to `sg-holidays` leaves `brand-2` on
the default. The whole reason the key is scoped.

**The mutable-default guard** (§2), which fails only on the second brand.

**Canonical order from three angles**: out of storage, out of an unknown-member
filter, and out of the menu's `onChange`.

**Toggling leaves the other two alone**, tested by adding and by removing —
the plan's explicit ask, and the failure mode of any implementation that
recomputes the whole selection from one checkbox.

**Keyboard operation end to end.** Tab to the trigger, Enter, arrow, Enter. It
records something worth knowing for Phase F: **Radix focuses the first item when
Enter opens the menu**, so one `ArrowDown` lands on the *second* set. The first
draft of this test asserted `['global']` and failed; the component was right and
the test was wrong, so the test now asserts the real behaviour and says why.

## 6. Verification

```
pnpm typecheck                    clean (all 10 packages)
pnpm lint                         clean (whole repo)
pnpm format:check                 clean (whole repo)
pnpm test                         1588 passed | 68 skipped (141 files)
pnpm -F @brandfactory/web build   clean in 494ms
```

Repo-wide **1567 → 1588 (+21)**, 139 → 141 files. **No existing test changed.**

### Acceptance

```
grep -rn 'KeyDatesMenu'    packages/web/src → KeyDatesMenu.tsx, KeyDatesMenu.test.tsx
grep -rn 'key-dates-prefs' packages/web/src → key-dates-prefs.test.ts
                                              (and one comment in key-dates/types.ts)
```

The menu is imported by its test and nothing else; the prefs module by its test
and nothing else. A–C are all dark, as the plan's dependency graph requires.

## 7. Carried forward

- **Phase D mounts both of these**, and is the first phase a user can see. It
  needs `KeyDatesMenu` in `PageHeader`'s action slot and `getEnabledSets` seeded
  in `SocialCalendarPage` — including D8's re-read on `brandId` change, which
  this module cannot enforce from its side.
- **The `Set`-rebuild ordering is now asserted in two places** (prefs and menu).
  If a third writer of `KeyDateSet[]` appears, it has to agree with both.
- **Nothing here knows about the horizon.** `staleSets` takes the enabled list
  as an argument; the menu neither warns that a set has run out of data nor
  disables it. That is D5's line under the month header, deliberately, because
  the horizon is a property of the month you are looking at rather than of the
  set.

## 8. Caveats

- **Nothing was looked at in a browser.** The menu renders in jsdom, its
  semantics are asserted, and no human has seen the three swatches in a popover.
  Phase F.
- **The swatch is 10px of colour with no border.** On the light theme's white
  popover the three inks measure 6.2:1 to 7.8:1 (Phase B §2), so they are not
  marginal — but a swatch that small is the first thing to check in Phase F if
  the palette reads weakly, ahead of the markers.
- **`enabled` is `KeyDateSet[]`, not `readonly KeyDateSet[]`.** It matches
  `useState`'s type at the call site D will write; the module never mutates it.
