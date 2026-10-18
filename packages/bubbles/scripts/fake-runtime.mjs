// A stand-in for DeepSeek's harness runtime in tests: the same JSON-RPC over stdio, playing the
// session events in FAKE_SCRIPT (a JSON list; `{ "sleep": ms }` waits) for each prompt, then
// ending the turn. Each prompt's text is appended to FAKE_LOG, one JSON line.
import { appendFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

const script = JSON.parse(process.env.FAKE_SCRIPT ?? '[]')
const send = (m) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n')
const event = (sessionId, type, data) =>
  send({ method: 'session.event', params: { sessionId, event: { type, data } } })

createInterface({ input: process.stdin }).on('line', async (line) => {
  const m = JSON.parse(line)
  if (m.method === 'initialize') {
    if (process.env.FAKE_INIT_FAIL) return send({ id: m.id, error: { message: 'no model' } })
    return send({ id: m.id, result: { env: process.env.BUBBLES_CORE_TOKEN } })
  }
  if (m.method === 'shutdown') return send({ id: m.id, result: {} })
  if (m.method !== 'session/prompt') return
  const { sessionId, contentBlocks } = m.params
  if (process.env.FAKE_LOG) {
    appendFileSync(
      process.env.FAKE_LOG,
      JSON.stringify({ text: contentBlocks[0].text, token: process.env.BUBBLES_CORE_TOKEN }) + '\n',
    )
  }
  send({ id: m.id, result: { messageId: 'm1' } })
  send({ method: 'session.status', params: { sessionId, status: 'running' } })
  for (const step of script) {
    if (step.exit) process.exit(1)
    if (step.sleep) await new Promise((ok) => setTimeout(ok, step.sleep))
    else event(sessionId, step.type, step.data)
  }
  if (!script.some((s) => s.type === 'turn/end')) {
    event(sessionId, 'turn/end', { reason: { kind: 'completed' } })
  }
  send({ method: 'session.status', params: { sessionId, status: 'idle' } })
})
