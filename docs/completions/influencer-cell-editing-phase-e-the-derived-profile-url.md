# Phase E — a profile URL derived from a handle

**Plan:** `docs/executing/influencer-cell-editing-and-profile-links-plan.md`, Phase E.
**Files:** new `packages/shared/src/influencer/profile-url.ts` and `profile-url.test.ts`;
`packages/shared/src/index.ts`, `influencer/influencer.ts`;
`packages/db/src/schema/influencer_accounts.ts`, `src/seed.ts`;
`packages/web-next/src/features/influencers/platforms.ts`, `platforms.test.ts`,
`components/platform-badges.tsx`, `components/influencer-detail.tsx`.
**Migration:** none. **Wire:** unchanged. **New dependency:** none.

The reversal. Four places used to say *"nothing derives a URL from a handle"*, and one test asserted
it. The rule is now **narrower rather than gone**, and the narrowing is what makes it defensible.

## Why it had to change

The argument behind the old rule was sound: a wrong link to a real stranger's profile is worse than
no link. What made it untenable was the data. **215 of the 216 accounts on the seeded roster hold
`url: null`**, so the linked badge 1.51.0 shipped lit up exactly one row out of 146 — a feature
nobody could see, on a column the reader had asked for twice.

## The three guards

| Platform | Derived from a handle |
| --- | --- |
| `instagram` | `https://instagram.com/{handle}` |
| `tiktok` | `https://tiktok.com/@{handle}` |
| `youtube` | `https://youtube.com/@{handle}` |
| `facebook` | `https://facebook.com/{handle}` |
| `linkedin` | `https://linkedin.com/in/{handle}` |
| `xiaohongshu` | **never** |

1. **A stored URL always wins.** Derivation is a fallback, never an override — so a URL somebody
   checked, or one the quick-add lookup grounded against a page it actually read, is never replaced
   by a template.
2. **XiaoHongShu never derives.** It addresses users by an opaque numeric id, so
   `xiaohongshu.com/<handle>` is not a wrong profile — it is not a profile. This is also the one
   platform a reader could not check by eye, which is why it is the refusal that keeps the original
   argument alive.
3. **Only a handle that is a plausible path segment derives.** `InfluencerHandleSchema` is
   deliberately loose — anything up to 100 characters, because handle grammar differs per platform
   and xiaohongshu handles are not latin at all. That looseness is right for *storing* a handle and
   wrong for *building a URL out of one*: a handle carrying a space or a slash is a **name** somebody
   typed into the wrong box. So derivation requires `^[A-Za-z0-9._-]+$` and answers `null`
   otherwise.

`PROFILE_URL_TEMPLATES` is a `Record<InfluencerPlatform, …>`, so a seventh platform fails to compile
rather than silently deriving nothing — and `xiaohongshu` is spelled out as `null` rather than
omitted, because the one platform that must never derive is the one that most needs its refusal
written down.

**No second parse through `WebsiteUrlSchema`.** The character class admits only characters that are
unreserved in a path segment, and the scheme and host are literals in the file, so that schema could
not refuse anything the guard admits — and the roster asks this question twice per row.

## It lives in `@brandfactory/shared`

Two surfaces read `account.url`: the roster's platform badges and the record page's account list. A
derivation only the roster knew about would make a badge open a profile while the same account, one
click away, rendered as plain text. So `accountProfileUrl(account)` sits beside the schema whose
docstring states the rule, and both surfaces call it.

(The plan counted three surfaces. The third was `ReachBreakdown`'s handle column, and Phase D
replaced that panel with one whose handles are inputs — so there are two.)

## What is knowingly given up

A stored URL was checked by a person or grounded by a retrieval log; a derived one is a template
over a string. **A handle that is correct on Instagram but wrong on TikTok now produces a confident
link to whoever holds that name on TikTok.** Nothing on screen tells the two apart, because the
reader chose not to mark derived links as unverified — a media list is worked by opening profiles,
and marking 211 of 216 of them "unverified" would make the mark the thing nobody reads rather than
the link.

That is recorded in `profile-url.ts` as a decision, not an oversight.

## The four places that stated the old rule

- `InfluencerAccountSchema.url` — rewritten to say what the column still means: *a stored URL is a
  fact; a derived one is a defensible guess*, and this column holds the first.
- `influencer_accounts.url` in `@brandfactory/db` — same.
- `seed.ts`'s account docstring — now says the screens fall back to a template for the other 215.
- `platform-badges.tsx` — now says the component decides nothing and the caller answers.

**The migration comment in `drizzle/0016_*.sql` was left alone.** A migration is a historical record
of what was true when it ran, and editing one is how a migration stops being trustworthy.

## Measured on the real roster, in a browser

The pass in Phase F counted the rendered anchors across all 165 seeded creators:

- **226 badge links**: `instagram.com` 146, `tiktok.com` 75, `youtube.com` 2, `facebook.com` 1,
  `linkedin.com` 1 — and **`www.instagram.com` 1**, which is Jaime Lee's *stored* URL. That last
  host is the proof that stored beats derived: the template would have produced `instagram.com`.
- **Every visible Xiaohongshu badge is a `<span>`, not an `<a>`.** Zero linked.
- Every link carries `target="_blank"` with `rel="noreferrer noopener"`.

## Tests

Eight in `packages/shared/src/influencer/profile-url.test.ts` — the five templates spelled out
rather than generated from the table (a test that reads the table asserts only that the function
calls it), the xiaohongshu refusal, the enum exhaustiveness, the path-segment guard including a
non-latin handle, and both directions of stored-versus-derived.

`platforms.test.ts`'s *"derives nothing from a handle"* becomes *"derives one from the handle where
the record holds none"*, plus a new xiaohongshu assertion and a new stored-wins assertion. Its
skip-a-URL-less-account test moves to **xiaohongshu**, because that is the only platform where
"answers nothing" is still reachable — an Instagram pair would now exercise the fallback instead of
the skip and would pass whether or not the loop continued.
