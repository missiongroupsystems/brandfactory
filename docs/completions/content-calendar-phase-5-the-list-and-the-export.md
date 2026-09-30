# Content calendar Phase 5 — the list, and the file the shooting team opens

**Shipped in:** 1.56.0. **Migration:** none. **Wire:** none — the export is built from data
the screen already holds. **New dependency:** none, and that is the decision this phase turned on.

## What this phase is

Step 5 of `docs/executing/content-calendar-plan.md`, plus the list view step 4 left out. They
belong together: the export writes the list's columns, and shipping one without the other would
mean a file whose shape no screen could be checked against.

## CSV, not `.xlsx`

The plan said `.xlsx` first, because the team works in a sheet. It ships as CSV, and the reason is
worth stating rather than discovering later.

`.xlsx` needs a spreadsheet library. This repository has refused a **date** library on the grounds
that a month grid and two converters did not earn one, and a run sheet of thirteen text columns
earns one considerably less. Both Excel and Google Sheets open a CSV natively, which is the actual
requirement — *they use a sheet* — and what `.xlsx` would add is column widths and a bold header
row. If somebody later needs merged cells or a second tab, that is the moment to pay for it.

Two things a hand-written CSV usually gets wrong are handled, and both are the difference between
a file that opens and a file that lies:

- **RFC 4180 quoting.** A hook containing a comma is not an edge case, it is Tuesday. Fields are
  quoted when they hold a comma, a quote or a newline, and inner quotes are doubled. Copy keeps
  its newlines, because a run sheet that joined two sentences would print a claim nobody wrote.
- **Formula defusing.** A spreadsheet evaluates a leading `=`, `+`, `-` or `@`. That is a known
  attack on whoever opens the file, and far more often it is a hook beginning with a dash arriving
  as `#NAME?` instead of as words. Those fields get a leading tab — a tab rather than an
  apostrophe, which Google Sheets displays.

**The BOM is load-bearing.** Without it Excel reads UTF-8 as the system codepage, and this
product's own roster — `罗大雄`, `temper.`, every curly apostrophe in a hook — arrives as mojibake.

## The export writes what is on screen

The current brand filter, the current range. A button that quietly exported more than the reader
could see is the one thing a run sheet must not do: the crew packs from the file.

It is generated in the browser from the entries already fetched, so there is no route, no second
serialisation of a `SocialPost`, and nothing to keep in step with the list beyond the column order
they share.

## The list is the view they already read

Grouped by week, the columns the earlier design pass settled: the hook widest because it is the
only column carrying a sentence, format under the entry type rather than taking a column of its
own, and talent and the freelancer sharing `People` under the labels *On camera* and *Filming*.

The month is the planning surface. This is the working one.

## The status pills moved off the accent, and that was a real violation

They first shipped as a green ramp — `bg-primary/5`, `text-primary` — carried over from the legacy
list. `web-next`'s `AGENTS.md` makes that wrong here, and states the budget: the accent is the
primary button, **one** accent-filled stat card, the selected control state, and small brand
chrome. A status pill repeats on every entry in a month, so green down thirty cells blows that
budget many times over.

It is the same argument the package already makes twice — `group-rail.ts` uses the chart series on
band rails rather than the accent, and `platform-icons.tsx` draws six brand marks in one colour
rather than six. So the pills use the chart series: neutral at `Idea`, an outline once somebody
cleared it, two chart hues for the stages where work is happening, a settled fill at `Posted`.

Not the feedback tints either, for the reason the key-date sets refused them: those mean error,
warning, success and information, and `Filming` is not a warning.

The ramp differs in lightness as well as hue, so it survives deuteranopia — and the word is always
beside it, which is what makes colour the fast path rather than the only one. `status-pill.ts` is
one file with both, because two copies of a five-key map is how a legend and a cell come to
disagree.

## The gate

`typecheck`, `lint`, `format:check`, `test`, both builds, plus `web-next`'s own three.
**3175 tests**, 14 more than phase 4, all of them `csv.ts` — the part where a quoting bug is
invisible until somebody opens the file.

## Not done here

- **No week view.** Last in the plan's order, and the month plus the list cover planning and
  working; a week view earns its place when somebody asks for it.
- **Still no writes.** The calendar reads. Entries are created in the legacy app, which is
  deployed and holds the editor.
