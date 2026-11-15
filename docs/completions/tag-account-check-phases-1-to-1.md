# Tag account check: phases 1 to 1

## Phase 1: say when an Instagram account may not take a tag or an invite

Plan: `tag-account-check-plan.md`. Version 2.68.0. No pack change, no migration.

### What changed

- `meta-collabs.ts`: `GET /brands/:brand/instagram/accounts/:handle` asks Business Discovery as
  the brand's Instagram account, read as the person. It answers `confirmed` (found: a business or
  creator account, which is public), `unconfirmed` (Meta's code 110, "Cannot find User": personal,
  private or misspelled) or `unknown` (any other refusal, such as a missing permission or a rate
  limit, so a setup gap never warns on every name). Stored nowhere, `cache-control: no-store`. The
  handle is checked with `meta-post.ts`'s pattern, now exported. The collaborators route uses the
  same account read.
- `account-check.tsx`: the post page asks once per brand and name, and for `unconfirmed` shows one
  line under the Collaborators row, the Tag people row and in the tag editor: "Instagram tags and
  invites public accounts only. We could not confirm @name is public." Nothing otherwise, and
  nothing in the demo.
- `meta-post.ts`: Meta's "The following user(s) cannot be accessed: …" becomes "Instagram could not
  reach @name. It tags and invites public accounts only. Remove the account or ask them to switch to
  public, then retry." Every other refusal keeps Meta's words.

### Verified

- Tests: the route's three answers, a bad name and a brand out of reach (both refused before Meta),
  `no-store`; the error sentence with two names, and another refusal unchanged; the web line for
  one and two names, nothing for `confirmed`, `unknown` or a failed read, one ask per brand and name.
- Browser, on a local core with the route's answer stubbed (the local core has no Meta app): the
  line under Collaborators and Tag people and in the tag editor, none for a confirmed account.

### Left

- The live check needs Meta's permissions for Business Discovery (`instagram_basic`,
  `instagram_manage_insights`, `pages_read_engagement`, and `ads_management` or `ads_read` when the
  Page role comes through Business Manager). After the deploy, check one business account and one
  made-up name on the live app. If both answer `unknown`, the Meta app's login configuration lacks
  a permission, and the page shows nothing.
- Task 1 of the handoff (a real post with a public account as tag and collaborator) waits for a
  public account from the owner.
