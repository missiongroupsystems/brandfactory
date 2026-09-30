# Content calendar Phase 0 (MKT-0) — the calendar gets a deployment again

**Shipped in:** 1.56.0. **Migration:** none. **Wire:** none — no route changed.
**New dependency:** none. **New infrastructure:** one Vercel project, `brandfactory-calendar`.

## What MKT-0 turned out to be

The build plan called this "not a build — a deploy and twenty minutes", on the belief that the
calendar had been pulled off a deployed front end and could be put back. The first half was right
and the second was not.

What the Vercel account actually holds:

- One project, `brandfactory-web`, on `branding.missionsystems.ai`, **framework `nextjs`**. The live
  HTML carries `_next`. It serves `packages/web-next`.
- `packages/web`, which still holds the working calendar, had **no deployment at all**.

And the project's own environment variables say how that happened. `brandfactory-web` still carries
five `VITE_*` production variables created in May 2026, alongside the `NEXT_PUBLIC_*` ones added in
September. **It is the same project, repurposed.** Nobody deleted the calendar and nobody deleted its
deployment: the one project that served it was pointed at the other package, and everything the
Vite app rendered went dark in the same moment. That is the whole regression, and it is invisible in
the git history, which is why the release-process question in the plan is the real fix.

## What this phase does

Gives the Vite app its own project, so the calendar is reachable while MKT-1 is built.

`brandfactory-calendar` — root directory `packages/web`, framework `vite`, git-linked to the
repository, deploying `dev/dani`. Vercel Auth is on for every `.vercel.app` URL, so it is
team-visible only until a custom domain is attached.

## The rewrites, and why the server was not touched

`packages/web/vercel.json` carried the SPA fallback and nothing else, so a deployed build would have
called `/api` on its own origin and found a static host. The fix is two rewrites that reproduce
`vite.config.ts`:

```json
{ "source": "/api/:path*",   "destination": "https://brandfactory.fly.dev/:path*" },
{ "source": "/blobs/:path*", "destination": "https://brandfactory.fly.dev/blobs/:path*" }
```

`/api` **loses its prefix**, because the dev proxy strips it (`path.replace(/^\/api/, '')`) and the
server mounts its routes at the root — `GET https://brandfactory.fly.dev/workspaces` answers 401,
not 404. `/blobs` passes through verbatim, the way the dev proxy already documents.

The point of doing it this way is what did **not** change: the browser sees one origin, so
`CORS_ALLOWED_ORIGINS` stays unset on Fly, and no production secret and no server restart were
needed to put a second front end in front of the same API.

`/rt` is deliberately absent. A Vercel rewrite does not carry a WebSocket upgrade, so proxying it
would fail anyway. The realtime client backs off and retries rather than throwing, and the social
calendar subscribes to nothing, so the one screen this phase exists for does not notice.

## Verified

Through Vercel Auth, with `vercel curl`:

- `GET /` → `<title>BrandFactory</title>` and `assets/index-*.js` — the Vite build, not Next.
- `GET /api/workspaces` → `{"code":"UNAUTHORIZED","message":"missing bearer token"}` — the
  BrandFactory server's own refusal, through the rewrite. A broken proxy gives a Vercel 404 and a
  broken origin gives a CORS error; this is neither.

## Not done here, and deliberately

- **Supabase redirect URLs.** Sign-in is `supabase`, and the new origin has to be in the project's
  allowed redirect list before a magic link or the Google button can return to it. A dashboard
  setting, not a repository one.
- **A custom domain.** `brandfactory-calendar-missionsystems.vercel.app` is what the team can reach
  today, and it is Vercel-Auth-gated.
- **`main`.** The rewrites live on `dev/dani`. A production deployment from the default branch needs
  them there first.
- **Accounts for Natalie and Chloe.** The other half of MKT-0, and the half no deploy can do.

## Found while doing this, and not fixed

`fly.toml` states the single-instance commitment in full: `native-ws` is an in-process bus, and "two
instances break the fan-out without an error". `flyctl scale show -a brandfactory` reports **count 2**
in `sin`. Realtime fan-out is therefore already broken in production for any client not on the
machine that published. It is a one-command change to a live app, so it is reported rather than
taken.
