# Decks Phase 2F — the Canva snapshot

**Shipped in:** unreleased. **Migration:** none — 2A's tables and CHECK already hold this shape.
**Wire:** no new route; `POST /brands/:id/decks/:deckId/versions` existed from 2C and had no caller.
**New dependency:** none.

## What this phase is

Decision 3, made real. The plan named it as the one open question that changes a CHECK arm rather
than a phase, and 2A settled it as **required**: a Canva version records the live link *and* the
PDF export taken at that moment. Everything below is the client side of that rule.

Before this, `web-next` could create a deck and read a stack. It could not put anything in one —
`CreateDeckVersionInput` appeared nowhere in the package and `useDeckMutations` returned `create`
alone.

## The two arms, and why they are not symmetrical

A version is one *source*, and the request says both of these things:

> Each version is one source — a PDF file or a Canva link.

> A Canva version snapshots on add: the team attaches the PDF export of that moment beside the
> live link.

Both are true, and the reconciliation is that **the snapshot is not a second source**. The source
is where the design still lives and stays editable; the PDF beside a Canva link is a frozen copy of
what the team actually saw. So:

- **`pdf`** — bytes, no link. The file *is* the version.
- **`canva`** — a link **and** a snapshot. The link opens whatever the design is today; the export
  preserves the day it was added.

`VersionForm` renders that asymmetry directly: the Canva arm grows a second required field, and the
PDF field's own label and hint change with the arm — *"PDF export of this design"* against *"PDF
file"*. The hint on the Canva arm is the argument, not decoration: *the link opens the current
design; this preserves what it looked like today.* A reader who is not told that reads the second
upload as duplicated effort.

## The write is ordered, and that is the phase's real content

**Upload first, insert second.** The reverse leaves a row pointing at bytes that never arrived, and
`deck_versions_source_shape` cannot catch it — a CHECK constrains a column, not an object store.

The two failure modes are therefore deliberately unequal:

- **Upload fails** → no row is written at all. Asserted.
- **Insert fails** → an unreferenced blob is left in storage. Tolerated, because the brand cascade
  already sweeps it through `listBlobKeysByBrand`, and because it is the strictly safer of the two.

This is the only phase in the four plans where a partial write is reachable, which is why it is the
only one that owes these tests.

## "Now current" is a question only the server can answer

The route answers a version create with the **whole deck**, not the row created — 2C's own note
says why: a backdated `versionDate` does not supersede a newer version. The toast reads the
returned `current` rather than assuming the thing just added leads, so a version dated last March
lands with *"behind the current version"* and says so. A client that patched the new row in and
called it current would be re-deriving `current` on the client, which is the one thing 2A exists to
prevent.

## Nine tests, and what each is for

Four are about the arms — no link on the PDF arm, both fields on the Canva arm, the reason shown,
and a Canva submit with no export refused **before** anything is uploaded or written. Three are
about the write — the upload/insert order asserted as a sequence, no row on a failed upload, and
the key from the upload arriving on the right arm of the payload. Two are about the toast telling
the truth in both directions.

## What is still not here

**No version delete.** The server has no route for one and the request is explicit that nobody
deletes the old file to add a new one; the stack only grows. **No edit.** A recorded version is a
statement about a day, and correcting one is adding another.
