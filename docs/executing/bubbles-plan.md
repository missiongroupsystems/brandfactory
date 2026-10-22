# Bubbles on the core: plan

For the agent that builds it. Branch: `feat/packs-core`. Bubbles is the agent people talk to in brand base. It runs on the
DeepSeek harness through OpenRouter, as openworld's Bubbles does, and it acts only through the core's MCP door
(`POST /mcp/:pack`), so every step passes the same eight checks as a screen.

## What we copy from openworld

Openworld (`~/projects/missions/openworld/apps/api/src/openworld_api/assistant/`) has no agent loop of its own. It runs
DeepSeek's prebuilt runtime (`deepseek-harness-sdk==0.1.5rc1`: a Python JSON-RPC client over stdio around a single
runtime binary of about 260 MB) and adds:

- a gateway in front of OpenRouter (`harness/gateway.py`): only the allowed tools, streaming on, a token cap, reasoning
  off, `data_collection: deny`, a fixed host list, retries on 429/5xx within 20 s, at most 12 model requests a turn;
- a turn worker per conversation and a supervisor with a 90 s turn deadline, cancel by killing the worker;
- an SSE stream to the browser: `message_start`, `status`, `text` (whole blocks), `tool_call`, `tool_result`, `error`,
  `message_end`;
- a chat card: what Bubbles is doing now, elapsed time, Stop, Try again, a confirmation pill for actions.

What the docs learned and we keep: reasoning off (first token 0.4–0.8 s, not 10 s); turns take 10–18 s; refusals must
say how to fix the call, or the model spends its whole budget; the runtime has no cancel and cannot reuse a session
after a restart, so the app replays the transcript.

We do not copy: voice, meetings, the SQL tools, the three.js scene, Mission Group's company text, or the read-only rule
(Bubbles here takes actions).

## Shape

```
web-next /bubbles page ──SSE──> packages/bubbles (Node) ──JSON-RPC stdio──> DeepSeek harness runtime
                                     │  gateway ──> OpenRouter (deepseek/deepseek-v4.1-flash)
                                     └── MCP over HTTP ──> core POST /mcp/brandbase (as the agent)
```

- **`packages/bubbles`** is generic: it knows a pack name and the core's URL, never a business word. It holds the
  OpenRouter key; the browser never sees it.
- **Identity.** Bubbles calls the core as an agent principal `<person>/bubbles` (`agent_of` = the person). The core
  checks the agent's loadout and the person's on every call (phase 4 of the core plan). Agents cannot approve or
  promote, so a send still needs the person's yes.
- **Effects.** When a move needs a yes, the core refuses the agent with `APPROVAL_NEEDED`. Bubbles stops and the page
  shows a confirmation card with what goes out. The person's tap calls `POST /approve` with their own token; Bubbles
  then retries the move once.
- **Memory.** None on the server in this version. The page keeps the transcript for the tab and sends it with each
  question; the service replays it into a fresh runtime.

## The page's contract with Bubbles

Phase 1's experiment (18 Oct) settled the transport: the runtime binary from openworld's wheel, driven over JSON-RPC
stdio from Node, mounted `POST /mcp/brandbase` with `transport: streamable-http` and a bearer header, listed all 52
moves as `mcp__brandbase__<move>` tools and ran `brand__list` through the core as an agent principal.

`NEXT_PUBLIC_BUBBLES_URL` is where the page finds Bubbles. With it unset, the page says Bubbles is not connected.

`POST /turns`, `Authorization: Bearer <the person's token>`, body
`{ conversation: string, question: string, history: { role: 'user' | 'bubbles', text: string }[], on?: string }`
(`on` names what the person is looking at, as `brand <id>`). The client
makes `conversation` (a UUID per chat) and always sends the history; Bubbles uses it only when it starts a fresh
runtime. The answer is `text/event-stream`, one `event: <name>` and `data: <json>` per frame:

| Event | Data | Meaning |
|---|---|---|
| `status` | `{ phase: 'starting' \| 'thinking' }` | before the first tool or text |
| `tool_call` | `{ id, tool, input }` | Bubbles runs a move; `tool` is the move name, e.g. `post.list` |
| `tool_result` | `{ id, tool, ok, preview?, refusal? }` | `refusal` is `{ code, message }` when the core said no |
| `approval` | `{ id, tool, input, payload }` | the move sends something and needs the person's yes |
| `text` | `{ text }` | a whole block of Bubbles' answer (Markdown); several may come |
| `error` | `{ code, message }` | the turn failed; `message` is plain words for the person |
| `done` | `{}` | the turn is over |

The page stops a turn by closing its stream; Bubbles then ends that turn and no later one.
`POST /turns/:conversation/stop` does the same for a client that cannot close it (204). To approve, the page calls the core's
`POST /approve/brandbase/<tool>` with `input` and the person's own token, then sends the turn "Yes, go ahead."

## Phases

1. **Harness in Node.** Port the SDK's JSON-RPC client (initialize, `session/prompt`, notifications) to TypeScript. Get
   the runtime binary from the `deepseek-harness-runtime-bin` wheel (macOS arm64 locally, Linux x64 in the image).
   Experiment first: the runtime mounts the core's MCP endpoint over streamable HTTP with a bearer header. If it
   cannot, run a small stdio MCP bridge that forwards to the core. Acceptance: with a fake model server, one turn lists
   brand base's tools and calls `brand__list` through the core.
2. **Gateway and turn.** Port the gateway rules to TypeScript, with tools taken from the core's `tools/list`. One HTTP
   route `POST /turns` streams SSE with openworld's event names. Turn deadline 90 s, 12 model requests, Stop kills the
   worker. Tests run against a fake OpenRouter.
3. **Agent identity in the core.** `POST /agents/session`: a signed-in person gets a short-lived token for their
   `<person>/bubbles` agent (created on first use, loadout = all of the person's moves). The token is signed with
   `AGENT_SECRET`; the core verifies it like any other token. Generic: no pack name in the code.
4. **The page.** A subagent builds `/bubbles` in web-next in the current look: one input, answers as cards, a line for
   what Bubbles is doing now, Stop, Try again, suggestion chips, and the confirmation card for sends. Playwright
   screenshots on desktop and phone.
5. **Live check.** One real turn through OpenRouter with the owner's key (costs cents). Then the as-built board and a
   completion doc.

Each phase: gate, one review, one commit. No deploys, no new Fly apps.

## Known exposure

Bubbles holds every move its person holds. Moves that send something out need the person's yes,
but the rest (edits, deletes, share links) run when Bubbles calls them, so text in a post or a
comment that talks Bubbles into a change could make one (review, 18 Oct). The persona tells it to
treat app text as data; a narrower default set for agents, named in the pack, is the fix if this
is not enough.

## Open decisions

1. Where the page sits: **settled 18 Oct, a fifth tab** (the owner).
2. The OpenRouter key and spend: **settled 18 Oct, the owner's key**, read from the clipboard for the phase 5 check.
3. Where Bubbles runs when deployed: **recommended 22 Oct, its own Fly app `brandbase-bubbles` (sin)**, the owner
   to confirm. Each conversation runs a ~200 MB runtime, which must not take memory from the core that publishes
   posts (512 MB), and Bubbles can then be stopped alone. `packages/bubbles/fly.toml` and `Dockerfile` (2.36.0).
