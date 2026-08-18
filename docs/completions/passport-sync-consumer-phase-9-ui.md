# Passport sync consumer, phase 9e/9f + the magic-link proxy

**Status:** phase 9 is complete. The magic-link bypass — open since 1.37.0 — is closed, in the
**break-glass** form. 2026-08-18, on `feat/passport-sync` at **1.43.0**.

Executes phase 9e and 9f of
[`docs/executing/passport-sync-consumer-plan.md`](../executing/passport-sync-consumer-plan.md),
plus the gap recorded in phase 6d and re-recorded in 1.40.0 §7.

**No migration.** **2438 tests** (+36).

---

## 1. The magic-link bypass, closed

### What was open

`/auth/resolve-login` decides whether an address belongs to Passport's hosted login. Until now
that decision was **advisory**, because the browser called `signInWithOtp` directly: a member
could ask BrandFactory's own Supabase project for a link and authenticate around Passport's
MFA, session policy, revocation and audit. The API was the policy, and the API said yes.

`POST /auth/magic-link` moves the call server-side. That is the whole mechanism: the refusal
now happens somewhere the client cannot skip.

### Break-glass, not strict — and that is a decision

A member is refused **while hosted login is working**, and allowed through when it is
observably not.

Strict — refusing always — is the stronger guarantee, and it was rejected for the same reason
`D1-b` was chosen: it would stop member sign-in during a Passport outage, which is exactly what
the rest of this integration goes out of its way to survive. Choosing strict here after
choosing `D1-b` there would have been incoherent.

**The cost is stated rather than hidden: somebody who controls a member's mailbox can wait for
an outage.** "MFA is enforced" becomes "MFA is enforced unless Passport is down", which is a
materially weaker claim and a harder one to put to an auditor.

### Evidence, not a probe

The obvious implementation is a health check against Passport. It is worse in three ways: it
needs an endpoint nobody specified, so it would be **guessed**; it adds a network call to the
login path; and "does Passport's API respond" is a different question from "can this person
complete hosted login".

So the signal is the real thing. `/auth/passport/start` and `/auth/passport/callback` already
know when hosted login failed — they redirect with `?error=passport_unavailable`. They record
it, and the proxy reads it.

The consequence is deliberate: **the first person during an outage must try hosted login and
fail before the door opens.** That is not a gap — it is what makes the door open on observed
failure rather than on a synthetic check that can be wrong. And the login screen already routes
that person to step 2 on the failure, so the flow reads naturally: try SSO, it fails, the magic
link is there.

### It defaults shut, and that direction is the property

With nothing recorded the answer is "hosted login is up", so a member is refused. Every
uncertainty resolves the same way: fresh process, expired window, no record.

Inverting it is the fail-open — a default of "probably down" hands every member a permanent
bypass with nothing to notice.

**Only `passport_unavailable` arms it.** `no_access`, `rate_limited` and a failed exchange are
Passport *working correctly and answering*; counting them as an outage would hand the bypass to
somebody Passport just turned away.

### The rest of the shape

- **The response is identical** whether it sent, refused, or found nothing. Reporting the
  difference rebuilds the account-existence oracle `/auth/resolve-login` is shaped to avoid,
  and the screen says "check your email" in every case.
- **Length capped, format never checked** — the same property, for the same reason.
- **Rate-limited by IP and email**, the same two buckets.
- **The anon key, not the service key.** This is the browser's own request relayed; the service
  key would bypass GoTrue's rate limits and turn an unauthenticated endpoint into one backed by
  a credential that can do anything in the project.
- **Every break-glass sign-in gets its own log line**, so "was MFA enforced for this session?"
  is one query rather than unanswerable.
- **The redirect is absolute**, because GoTrue rejects a relative one. `APP_BASE_URL` first,
  the request `Origin` second — which is what the browser used to supply, and GoTrue's own
  redirect allow-list is the control on where a link may point.

### ⚠️ The Google button is a separate door and is STILL OPEN

`signInWithOAuth` redirects the browser to Google. There is no request body to relay, only a
top-level navigation, so it cannot be proxied the same way. Closing it means either dropping
Google for members or building a server-side OAuth start of our own. **Not done, and not
hidden.**

### The guard

`magic-link-proxy.test.ts` sweeps `packages/web` for `signInWithOtp` and `/auth/v1/otp` — the
REST form, which is the obvious way around a rule about a method name. The failure it prevents
is the next call somebody adds on an invite screen or a re-send button: one line, what every
Supabase example shows, works perfectly, and silently reopens the hole.

One file is allowed: the provider's own suite, which names the method to assert it is **not**
called. A second test pins that assertion, because the allow-list is only safe while it exists.

## 2. The eligibility endpoint

`GET /passport/structure/me` → `{ canWriteStructure, organizationId }`.

**I twice reported the promote affordance and the drift view as blocked on "the client cannot
know if you are an Admin". They were one route away**, and the server already computed the
answer. That was a wrong call, and this is the correction.

`actor()` is split into a non-throwing resolver plus the throwing wrapper the writes use, so
`/me` and the writes cannot disagree. A second copy of the gate that drifted would tell a
client "you may write" and then 403 every button it rendered — pinned by a test that asserts
the two answers match across five roles.

It answers `200` with `false`, never `403`: a refusal is the answer here, not an error, and a
403 would put a failed request in every non-Admin's console on every page load.

## 3. The drift view

Two lists, and **merging them is the failure**:

| Section | Means | Needs |
| --- | --- | --- |
| **Not in Mission Passport** | exists here and nowhere else; no sibling app can see it | an Admin |
| **Different name in Passport** | the display label differs from the legal name | **nobody** — expected and permanent under `D1-b` |

One merged list puts dozens of permanent, correct rows in front of the two that need action.
That is how a drift screen becomes a screen nobody opens, and the rows it existed for are the
ones that get buried.

The divergence section **says "Expected" in as many words**. Without that it reads as a list of
faults, and somebody spends an afternoon "fixing" thirty rows that are correct by design.

The panel renders nothing at all for somebody who cannot act — which is everybody on every
deployment with no Passport, i.e. all of them today. Not for secrecy, since the server refuses
regardless, but because a panel of things you cannot change is noise on everyone else's
settings page.

## 4. The confirmation names the consequence outside this app

A generic "are you sure" trains people to click through. What makes this one worth reading is
that the consequence leaves BrandFactory, which nothing else in the app can say: the brand
becomes visible to every other Mission Systems app, the name becomes the unit's **legal** name
that sibling apps use for statutory output, and it cannot be undone from here.

**No typed-name gate, deliberately.** `DeleteBrandDialog` makes you type the name because
deletion is irreversible and cascades. This is *additive* — it publishes a record rather than
destroying one. Copying the gate would spend the strongest signal the app has on the milder
action and make the two indistinguishable, which is how a typed-name gate stops meaning
anything.

Success reports **pending**, never done: the link arrives by event a moment later, so claiming
completion would be wrong for about a second and the row would then "correct" itself in a way
that reads as a bug.

Failures surface the server's own message verbatim — "only an Owner or Admin", "sign in with
your Passport account", "temporarily read-only". Replacing them with a generic failure discards
the whole point of mapping Passport's statuses.

## 5. The gate

```
pnpm typecheck                    all 11 packages           pass
pnpm lint                         eslint, whole repo        pass
pnpm format:check                 prettier                  pass
pnpm test                         2438 passed | 92 skipped
pnpm -F @brandfactory/web build   tsc + vite                pass
```

## 6. Still open

| Item | Blocked by |
| --- | --- |
| **The Google bypass** | needs its own pass — see §1 |
| Arming `authz.ts` | **the operator gate** |
| Any end-to-end verification | an entitlement, and hosted login configured |
| CI | `PASSPORT_REPO_TOKEN` |

Nothing in this pass has run against a real Passport project. Every path is covered by tests
with mocked clients.
