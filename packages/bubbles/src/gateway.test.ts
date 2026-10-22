import { createServer, type Server } from 'node:http'
import { type AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { Gateway, type GatewayOptions } from './gateway'

const servers: { close(): unknown }[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()))
})

/**
 * A fake OpenRouter: answers each request with the next status, recording what it was sent; a
 * cost given ends the answer with OpenRouter's usage event.
 */
async function upstream(statuses: number[] = [200], cost?: number) {
  const seen: { auth?: string; body: Record<string, unknown> }[] = []
  const server: Server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      seen.push({ auth: req.headers.authorization, body: JSON.parse(body) })
      const status = statuses.shift() ?? 200
      res.writeHead(status, { 'content-type': 'text/event-stream' })
      const usage = cost === undefined ? '' : `data: {"choices":[],"usage":{"cost":${cost}}}\n\n`
      res.end(status === 200 ? `data: {"choices":[]}\n\n${usage}data: [DONE]\n\n` : '')
    })
  })
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  servers.push(server)
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen }
}

async function gateway(opts: Partial<GatewayOptions> & { upstream: string }) {
  const g = new Gateway({
    apiKey: 'the-real-key',
    model: 'deepseek/deepseek-v4.1-flash',
    providers: ['together', 'novita'],
    toolPrefix: 'mcp__toy__',
    retryDelaysMs: [1, 1],
    dailyUsd: 100,
    ...opts,
  })
  await g.listen()
  servers.push(g)
  return g
}

const ask = (g: Gateway, token: string | null, body: Record<string, unknown>) =>
  fetch(`${g.url}/v1/chat/completions`, {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  })

const ok = {
  model: 'whatever-the-runtime-says',
  stream: true,
  max_tokens: 9000,
  messages: [{ role: 'user', content: 'hi' }],
  tools: [{ type: 'function', function: { name: 'mcp__toy__note__list' } }],
}

describe('the model gateway', () => {
  it('keeps the OpenRouter key from the runtime and serves only runtimes it gave a pass', async () => {
    const up = await upstream()
    const g = await gateway({ upstream: up.url })
    const pass = g.pass()
    expect((await ask(g, null, ok)).status).toBe(401)
    expect((await ask(g, 'made-up', ok)).status).toBe(401)
    expect((await ask(g, pass.token, ok)).status).toBe(200)
    expect(up.seen[0]!.auth).toBe('Bearer the-real-key')
    pass.revoke()
    expect((await ask(g, pass.token, ok)).status).toBe(401)
    expect(up.seen).toHaveLength(1)
  })

  it('passes on only streamed, capped requests whose tools all come from the core', async () => {
    const up = await upstream()
    const g = await gateway({ upstream: up.url })
    const { token } = g.pass()
    expect((await ask(g, token, { ...ok, stream: false })).status).toBe(400)
    expect((await ask(g, token, { ...ok, max_tokens: undefined })).status).toBe(400)
    const shell = { type: 'function', function: { name: 'bash' } }
    expect((await ask(g, token, { ...ok, tools: [...ok.tools, shell] })).status).toBe(400)
    expect(up.seen).toHaveLength(0)
  })

  it('asks the chosen model with no data collection, no reasoning and a token cap', async () => {
    const up = await upstream()
    const g = await gateway({ upstream: up.url })
    await ask(g, g.pass().token, {
      ...ok,
      reasoning: { enabled: true },
      models: ['some/expensive-model'],
      plugins: [{ id: 'web' }],
    })
    expect(up.seen[0]!.body.models).toBeUndefined()
    expect(up.seen[0]!.body.plugins).toBeUndefined()
    expect(up.seen[0]!.body).toMatchObject({
      model: 'deepseek/deepseek-v4.1-flash',
      max_tokens: 1200,
      reasoning: { enabled: false },
      stream_options: { include_usage: true },
      provider: { only: ['together', 'novita'], data_collection: 'deny' },
    })
  })

  it('ends a turn at its request budget, and the next turn counts afresh', async () => {
    const up = await upstream()
    const g = await gateway({ upstream: up.url, maxRequests: 2 })
    const pass = g.pass()
    expect((await ask(g, pass.token, ok)).status).toBe(200)
    expect((await ask(g, pass.token, ok)).status).toBe(200)
    expect((await ask(g, pass.token, ok)).status).toBe(429)
    expect(pass.requests).toBe(2)
    pass.reset()
    expect((await ask(g, pass.token, ok)).status).toBe(200)
  })

  it('stops the model generating when the runtime goes away mid-answer', async () => {
    let closed = false
    const slow = createServer((req, res) => {
      req.resume()
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write('data: {"choices":[]}\n\n')
      res.on('close', () => (closed = true))
    })
    await new Promise<void>((done) => slow.listen(0, '127.0.0.1', done))
    servers.push(slow)
    const g = await gateway({
      upstream: `http://127.0.0.1:${(slow.address() as AddressInfo).port}`,
    })
    const runtime = new AbortController()
    const res = await fetch(`${g.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${g.pass().token}` },
      body: JSON.stringify(ok),
      signal: runtime.signal,
    })
    expect(res.status).toBe(200)
    runtime.abort()
    await expect.poll(() => closed, { timeout: 3000 }).toBe(true)
  })

  it('retries a busy model before the runtime sees anything, then gives up', async () => {
    const busyOnce = await upstream([429, 200])
    const g = await gateway({ upstream: busyOnce.url })
    const res = await ask(g, g.pass().token, ok)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('[DONE]')
    expect(busyOnce.seen).toHaveLength(2)

    const alwaysBusy = await upstream([503, 503, 503, 503])
    const g2 = await gateway({ upstream: alwaysBusy.url })
    expect((await ask(g2, g2.pass().token, ok)).status).toBe(503)
    expect(alwaysBusy.seen).toHaveLength(3)
  })

  it('stops asking the model once the day’s spend, by OpenRouter’s own count, reaches the cap', async () => {
    const up = await upstream([200, 200, 200], 0.4)
    const g = await gateway({ upstream: up.url, dailyUsd: 0.8 })
    const { token } = g.pass()
    for (let i = 0; i < 2; i++) await (await ask(g, token, ok)).text()
    expect(g.spentToday).toBeCloseTo(0.8)
    expect(g.overBudget).toBe(true)
    expect((await ask(g, token, ok)).status).toBe(429)
    expect(up.seen).toHaveLength(2)
  })

  it('holds a request whose cost never arrives, and charges nothing for a refused one', async () => {
    const noCost = await upstream([200])
    const g = await gateway({ upstream: noCost.url, holdUsd: 0.05 })
    await (await ask(g, g.pass().token, ok)).text()
    expect(g.spentToday).toBeCloseTo(0.05)

    const refused = await upstream([400])
    const g2 = await gateway({ upstream: refused.url, holdUsd: 0.05 })
    expect((await ask(g2, g2.pass().token, ok)).status).toBe(400)
    expect(g2.spentToday).toBe(0)
  })

  it('starts each UTC day with a fresh budget', async () => {
    let now = new Date('2026-10-22T23:59:00Z')
    const up = await upstream([200, 200], 1)
    const g = await gateway({ upstream: up.url, dailyUsd: 1, now: () => now })
    const { token } = g.pass()
    await (await ask(g, token, ok)).text()
    expect((await ask(g, token, ok)).status).toBe(429)
    now = new Date('2026-10-23T00:01:00Z')
    expect(g.overBudget).toBe(false)
    expect((await ask(g, token, ok)).status).toBe(200)
  })
})
