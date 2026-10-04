# Renaming and annotating brand photos — a guide for Chloe

**MKT-6.** Promised at the marketing workshop on 16 September 2026. Written 4 October 2026.

**What this is for.** You are moving photos from Dropbox to Google Drive by hand, one file at a time, because renaming does not work in the browser. This guide moves the renaming to your computer, where it works on hundreds of files at once, and sets a naming rule that lets Brand Base file every photo later without anyone retyping anything.

**Assumption.** The steps below are written for a Mac with Dropbox and Google Drive for desktop installed. Windows steps are at the end. If your setup is different, say so and the steps change, not the rule.

---

## 1. The rule: the folder and the filename carry the facts

A photo's folder says **which brand** and **what kind of shot**. Its filename says **what is in it** and **when it was shot**. Nothing else needs to be typed per photo.

### Folders

```
Brand Base Photos/
  Casa Vostra/
    Food/
    Interior/
    People/
    Product/
    Event/
  Willow/
    Food/
    ...
```

- **One folder per brand**, spelled exactly as the brand is named in Brand Base: `Casa Vostra`, `Willow`, `Chin Mee Chin`, `temper.`, `Carlitos`, `Firebird by Suetomi`, `Ungrafted Vines`.
- **One folder per category** inside it. Use the category names the brand's Photography page shows. Start with the five above; add one only when a photo fits none of them.
- Do not nest deeper. A third level (`Food/Mains/Pasta`) is a filename's job.

### Filenames

```
<subject>_<YYYY-MM-DD>_<nn>.jpg
```

| Part | What goes in it | Example |
| --- | --- | --- |
| subject | The dish, the space or the person, in plain words joined by hyphens. | `cacio-e-pepe`, `bar-counter`, `chef-marco` |
| date | The day of the shoot, year first. Use the shoot day, not the download day. | `2026-09-12` |
| nn | A two-digit number, to tell apart shots of the same subject that day. | `01`, `02` |

Examples:

```
Casa Vostra/Food/cacio-e-pepe_2026-09-12_01.jpg
Casa Vostra/Interior/bar-counter_2026-09-12_03.jpg
Willow/People/chef-marco_2026-08-30_01.jpg
```

Five rules that keep this machine-readable:

1. **Lowercase, hyphens inside a part, underscores between parts.** No spaces, no `&`, no `/`, no emoji.
2. **Year first in the date.** `2026-09-12` sorts correctly; `12-09-26` does not, and it means a different day in the US.
3. **Do not put the brand in the filename.** The folder already says it, and two places for one fact will disagree one day.
4. **Do not use `final`, `v2`, `edit` or `copy`.** If two versions both matter, they are two subjects (`cacio-e-pepe-overhead`, `cacio-e-pepe-side`).
5. **Unknown is a word, not a gap.** If you do not know the date, write `undated`: `bar-counter_undated_01.jpg`.

**Why this matters to Brand Base.** When a photo is uploaded, Brand Base uses the filename, without the extension, as the photo's label. A file named `IMG_4471.jpg` gets the label `IMG_4471`. A file named `cacio-e-pepe_2026-09-12_01.jpg` gets a label you can search for. When the Drive pipeline arrives (MKT-8), the folder gives the brand and the category, and the filename gives the subject and date, with no person in the loop.

---

## 2. Rename a batch on a Mac

**Caution:** rename a copy first if you are not sure. Finder's rename cannot be undone after you close the window, except with Edit → Undo straight away.

1. Download the batch from Dropbox into a local working folder, one shoot at a time. (Or work in the Dropbox folder in Finder directly, if Dropbox for desktop is installed. It syncs the new names up.)
2. In Finder, select every photo of **one subject**. Click the first, hold Shift, click the last.
3. Right-click the selection and choose **Rename…**.
4. Set the first menu to **Format**.
5. Set **Name Format** to **Name and Counter**.
6. Set **Where** to **after name**.
7. Type the name with the date, for example `cacio-e-pepe_2026-09-12_`. Include the last underscore.
8. Set **Start numbers at** to `1`.
9. Click **Rename**.

Finder writes `cacio-e-pepe_2026-09-12_1.jpg`, `…_2.jpg`, and so on. It does not pad to two digits. That is acceptable: the counter only needs to be unique.

To fix one part of many names at once, use **Replace Text** in the same window. For example, replace `2026-09-21` with `2026-09-12` if the whole batch carried the wrong date.

### Move the batch into Drive

1. Open **Google Drive** in Finder. It appears in the sidebar once Google Drive for desktop is installed.
2. Drag the renamed files into the matching `Brand/Category` folder.
3. Wait for the sync to finish. The cloud icon beside each file shows its state.

The names you set in Finder are the names Drive keeps. This replaces the download, rename and re-upload loop with one drag.

---

## 3. Annotate: one sheet per brand, one row per photo

Finder tags and the Get Info comment field stay on your Mac. They do not travel to Drive, so do not use them for anything another person needs.

Keep a Google Sheet called `Photo notes` in each brand folder, with these columns:

| Column | Fill it when | Example |
| --- | --- | --- |
| filename | Always. Paste it from Finder (select the file, press Enter, Cmd-C). | `cacio-e-pepe_2026-09-12_01.jpg` |
| outlet | The photo is of one outlet. | `Casa Vostra Tanjong Pagar` |
| dish | A dish is in the frame and its menu name differs from the subject. | `Cacio e Pepe with black truffle` |
| people | Someone identifiable is in the frame. | `Chef Marco` |
| photographer | You know who shot it. | `Studio Kin` |
| usage | The photo has a restriction. | `Social only, not print`, `Expires 2027-03` |
| alt | You want to describe the photo for a screen reader. One sentence. | `A bowl of pasta on a marble counter, shot from above.` |
| notes | Anything else. | `Reshoot planned — sauce looks dry` |

- **Only `filename` is required.** Leave a cell empty rather than guess.
- **`usage` is the column that saves trouble later.** A photo that may not go in print looks exactly like one that may.
- **Do not put the brand, the category, the subject or the date here.** The folder and the filename already carry them.

The sheet is the annotation pipeline's input. When MKT-8 lands, it reads the sheet and joins it to the files by filename. That is why the filename column must match exactly.

---

## 4. A first batch, end to end

1. Pick one brand and one shoot. A shoot of about 30 photos is a good first test.
2. Download it from Dropbox.
3. Sort it in Finder by subject, and rename each group (section 2).
4. Drag it into `Brand Base Photos/<Brand>/<Category>/` in Drive.
5. Add one row per photo to that brand's `Photo notes` sheet, filling only what you know.
6. Send the folder link to the Brand Base team. We check that the names parse before you do the rest.

---

## Windows

- **Rename:** File Explorer can rename a selection at once (select, press F2, type the name), but it writes `name (1).jpg`, with a space and brackets. Install **PowerRename** from Microsoft PowerToys instead. It renames a selection with a counter in the form this guide uses: search `.*`, replace with `cacio-e-pepe_2026-09-12_${start=1}`, tick **Use regular expressions**, and set **Apply to** to **Filename only**.
- **Drive:** Google Drive for desktop adds a `G:` drive in File Explorer. Drag the files into it as on a Mac.
- **Annotate:** the same Google Sheet, the same columns.

---

## What this does not cover

- **Video.** The same folder and filename rule applies, but Brand Base's library holds images only today.
- **Reverse image search** (finding the original from a screenshot) is MKT-9 and is parked. Good filenames make it cheaper when it comes back, because a search that lands on `cacio-e-pepe_2026-09-12_01.jpg` already tells you what you found.
- **Photos already in Drive with camera names.** Rename them in place in the Drive folder in Finder, with the same steps. Drive keeps the file's history and links.
