import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { serve } from '@hono/node-server'
import { coreAgentSession, createBubbles } from './app'
import { Gateway } from './gateway'
import { patch, PERSONA } from './prompt'
import { Runtime } from './runtime'
import { Turns } from './turns'

/**
 * Bubbles: the DeepSeek harness runtime behind one HTTP door, acting through one pack's moves on
 * the core. It knows the pack by name only; what the pack is about comes from its brief.
 */

function need(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is required`)
  return v
}

const env = process.env
const coreUrl = need('CORE_URL').replace(/\/$/, '')
const pack = env.BUBBLES_PACK ?? 'brandbase'
const model = env.BUBBLES_MODEL ?? 'deepseek/deepseek-v4.1-flash'
const brief = env.BUBBLES_BRIEF ? readFileSync(env.BUBBLES_BRIEF, 'utf8') : ''
const bin = need('DSH_BIN')

const gateway = new Gateway({
  upstream: (env.OPENROUTER_URL ?? 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
  apiKey: need('OPENROUTER_API_KEY'),
  model,
  providers: (env.BUBBLES_PROVIDERS ?? 'together,alibaba,novita,deepinfra').split(','),
  toolPrefix: `mcp__${pack}__`,
})
await gateway.listen()

const patchFile = join(mkdtempSync(join(tmpdir(), 'bubbles-patch-')), 'bubbles.yml')
writeFileSync(
  patchFile,
  patch({
    persona: brief ? `${PERSONA}\n\n${brief.trim()}` : PERSONA,
    mcpUrl: `${coreUrl}/mcp/${pack}`,
    server: pack,
  }),
)

const turns = new Turns({
  gateway,
  model,
  server: pack,
  start: ({ env: runtimeEnv }) =>
    Runtime.start({
      command: [bin],
      patch: patchFile,
      env: runtimeEnv,
      provider: 'bubbles',
      model,
    }),
})

const app = createBubbles({
  turns,
  agentSession: coreAgentSession(coreUrl),
  corsOrigins: (env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
})
const port = Number(env.PORT ?? 3014)
const server = serve({ fetch: app.fetch, port, hostname: env.HOST ?? '127.0.0.1' }, (info) =>
  console.info(`bubbles on :${info.port}, acting on ${pack} at ${coreUrl} with ${model}`),
)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void turns.close()
    void gateway.close()
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 3000).unref()
  })
}
