# Passport sync consumer, phase 7 — offboarding, and an asymmetry phase 6A left behind

**Status:** complete, 2026-08-17. Written against `main` at **1.37.0**
(2168 passed | 92 skipped before → **2190 passed | 92 skipped** after; +22 tests).

Executes phase 7 of
[`docs/executing/passport-sync-consumer-plan.md`](../executing/passport-sync-consumer-plan.md).

**No migration.** Two things landed: a real bug from phase 6A, and rule 6's session
half — which turned out to be a different mechanism from the one the plan sketched.

---

## What landed

| File | Purpose |
| --- | --- |
| `passport/verify-bearer.ts` | **new** — the two-issuer resolution, in ONE place, shared by HTTP and websockets |
| `passport/offboard.ts` | **new** — the `membership.removed` hook |
| `adapters/realtime/src/port.ts` + `native-ws.ts` | `disconnectUser(userId)` |
| `middleware/auth.ts` | rewritten to use the shared verifier |
| `ws.ts` | authenticates through the shared verifier; takes it as a required dep |
| `passport/handlers.ts` | `PassportSyncHooks`, called **after** the tombstone commits |
| `app.ts`, `main.ts` | one verifier per process, handed to both transports |

Tests: 9 for the verifier, 8 for offboarding, 5 for `disconnectUser` against real
sockets.

## 1. The bug phase 6A shipped

**Phase 6A put the two-issuer fallthrough in `middleware/auth.ts` and left `ws.ts`
calling `deps.auth.verifyToken` directly.** The adapter only knows BrandFactory's own
issuer, so a hosted-login user's websocket upgrade would have been refused with `4401`
while every HTTP request worked perfectly.

**The symptom is the worst kind: asymmetric and silent.** The app loads, the brand hub
renders, and the canvas simply never updates. Nothing errors on the server, and a
`4401` reads as an expired token, so the hunt starts at the session rather than at the
upgrade.

The contract is explicit that this resolver must be shared and that a divergence
between two copies is an auth bug. So `verify-bearer.ts` is now that one copy, and
**`mountRealtime` takes it as a required dependency** — the type system refused to
compile until every entry point had it, which is the property worth having. `main.ts`
builds one instance and hands the same one to `createApp` and to `mountRealtime`.

A test asserts the property directly: both transports read the same resolution, so a
hosted-login user cannot end up with working requests and a dead socket.

## 2. Rule 6's first half needs no code, and that is the point

Rule 6 asks for the person's local unit-scoped grants **and** their live sessions to be
revoked on `membership.removed`.

**The grants need nothing.** BrandFactory holds none — the projection *is* the grant
model — so the moment the tombstone commits, the next derivation for that org returns an
empty map. There is nothing local to revoke, which is exactly the payoff for not keeping
a shadow. A consumer that had its own `user_brands` table would have real work here.

## 3. The second half is a different mechanism from the one the plan sketched

The plan proposed a **subject denylist** checked in auth middleware. Building it would
have been wrong, and the reason is worth recording.

The usual worry is a still-valid access JWT outliving a revocation on the HTTP path.
**That is not the gap here**, because every request re-derives from the projection and
gets `{}`. And the blunt version of a denylist is actively harmful: refusing every
request from a token issued before the revocation would sign the person out of
BrandFactory **entirely**, even though they may still belong to other organisations
here — which is the over-broad revocation rule 6 explicitly warns against.

**The real gap is the websocket.** `authorize` runs once per channel at subscribe time
and never again, so a revoked member with an open subscription keeps receiving canvas
events for a brand they have lost, however correctly their HTTP reads are now denied.
Nothing in the HTTP path can close that.

### A disconnect is a re-authorization, not a logout

`disconnectUser` closes sockets and touches nothing else. The person's token is
untouched, so their client reconnects, re-subscribes, and **every channel is
re-authorized on the way back in** — leaving them with exactly what they are still
entitled to.

That framing is what makes it safe under "yours only": no credential of Passport's is
involved, nothing reaches another app, and removal from one organisation does not end a
session serving a different one. We hold no service-role key for Passport's project and
must never be given one.

Two details:

- **The close code is `4403`, not `4401`.** A client reading an auth failure would sign
  the person out — precisely what must not happen. A distinct code lets it reconnect
  quietly. Asserted.
- **Resolution is by the payload's embedded `email`, not the identity link.** Sockets
  are keyed by the **local** user id, and for a hosted-login session that is *not*
  `identity_link.subject`, which holds Passport's subject — so walking the link table
  would find the wrong key or none. Email is the one identifier both sides hold, and
  every local row for that address is disconnected, because two case-variant rows are a
  real state in this schema.

## 4. Ordering and error handling, both deliberate

- **The tombstone commits before the hook runs.** Reversed, the client would reconnect
  and be re-authorized against stale data — walking straight back into the channel it
  just lost. Asserted by recording the order.
- **A hook failure PROPAGATES.** A failed disconnect leaves a revoked person receiving
  events; Passport retries on a non-2xx and the retry retries the disconnect. Acking an
  event whose side effect failed is the one outcome worth avoiding. The tombstone has
  already landed by then, so the retry is idempotent rather than half-repeated work.
- **Zero sockets closed is not logged.** Most people are not connected when they are
  removed, and a nightly reconcile re-applying an old tombstone would otherwise produce
  the same warning forever.
- **Logging is counts and the org id, never the email** — the membership payload is
  staff PII and this goes to the same log as everything else. Asserted.

## 5. One test hung, and the reason is worth knowing

`wss.close()` waits for its clients, so the test that deliberately leaves a second
socket open hung the *teardown* rather than the assertion — which presents as a
mysteriously slow test rather than a wrong one. The survivor is now closed explicitly,
with the reason at the code.

## 6. The gate

```
pnpm typecheck                    all 11 packages    pass
pnpm lint                         eslint, whole repo pass
pnpm format:check                 prettier           pass
pnpm test                         2190 passed | 92 skipped
pnpm -F @brandfactory/web build   tsc + vite         pass
```

## 7. What this does NOT do

- **It cannot bite until phase 8.** `authorizeChannel` still runs the interim
  shared-access model, so today a reconnecting member is re-authorized into everything.
  The disconnect is correct and the re-authorization is real; what it re-checks becomes
  meaningful when `authz.ts` reads the projection.
- **It does not revoke a session.** By design. If a person must be signed out of
  everything, that is the Passport console's confirmed "sign out everywhere", and it is
  not a consumer's to build.
- **It does not touch app-native sessions specially.** A disconnect is issuer-agnostic,
  which is why there is one code path rather than two.

## 8. Needed from the operator

Nothing new. Phase 7 is self-contained.
