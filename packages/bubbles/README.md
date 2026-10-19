# Bubbles

The agent people talk to in brand base. It runs DeepSeek's harness runtime, as openworld's
Bubbles does, and acts only through one pack's moves on the core (`POST /mcp/<pack>`), as the
person's agent. The plan, with the page's contract, is `docs/executing/bubbles-plan.md`.

```
page ──POST /turns (SSE)──> Bubbles ──stdio──> DeepSeek harness runtime ──> core /mcp/<pack>
                                │  gateway ──> OpenRouter
                                └── core /agents/session (the person's token → the agent's)
```

## Run it

```bash
CORE_URL=http://127.0.0.1:3013 \
DSH_BIN=<the runtime binary> \
OPENROUTER_API_KEY=... \
BUBBLES_BRIEF=../../packs/brandbase/bubbles.md \
CORS_ALLOWED_ORIGINS=http://localhost:3002 \
pnpm -F @brandfactory/bubbles start
```

The runtime binary ships in the `deepseek-harness-runtime-bin==0.1.5rc1` wheel, one per
platform (`deepseek_harness_runtime/runtime/deepseek-harness-sdk-runtime-<os>-<arch>`).

| Setting                | Default                             |                                           |
| ---------------------- | ----------------------------------- | ----------------------------------------- |
| `CORE_URL`             | required                            | the core                                  |
| `DSH_BIN`              | required                            | the runtime binary                        |
| `OPENROUTER_API_KEY`   | required                            | held by the gateway only                  |
| `OPENROUTER_URL`       | `https://openrouter.ai/api/v1`      | tests and local checks point it at a fake |
| `BUBBLES_PACK`         | `brandbase`                         | the pack whose moves are the tools        |
| `BUBBLES_MODEL`        | `deepseek/deepseek-v4.1-flash`      |                                           |
| `BUBBLES_PROVIDERS`    | `together,alibaba,novita,deepinfra` | OpenRouter hosts, fastest first           |
| `BUBBLES_BRIEF`        | none                                | the pack's brief, added to the persona    |
| `PORT`, `HOST`         | `3014`, `127.0.0.1`                 |                                           |
| `CORS_ALLOWED_ORIGINS` | none                                | the page's origin(s)                      |

## What it holds to

- The OpenRouter key stays in the gateway; the runtime gets a pass of its own. The gateway sends
  only streamed, capped requests whose tools all come from the core, with no data collection and
  reasoning off, at most 12 a turn, and stops the model when the runtime goes away.
- The person's token never reaches the runtime: the runtime acts with the agent's token, so the
  core checks the agent's moves and its person's on every call, and a send waits for the person.
- A conversation keeps its runtime between questions and belongs to one person; a turn has 90 s
  and can be stopped. A stopped, timed-out or dead runtime is replaced, with the chat replayed.

Tests (`src/*.test.ts`) run a fake runtime (`scripts/fake-runtime.mjs`) and a fake model.
