import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

/**
 * DeepSeek's harness runtime, driven over JSON-RPC on stdio as its Python SDK drives it
 * (`deepseek_harness/client.py`): `initialize`, then `session/prompt` per turn, with the session's
 * events as notifications until the session goes idle. One runtime holds one conversation; the
 * runtime has no cancel, so a stopped turn kills it.
 */

/** One event of a session: `tool/call`, `tool/result`, `assistant/message`, `turn/end`, ... */
export interface RuntimeEvent {
  type: string
  data: Record<string, unknown>
}

export interface RuntimeOptions {
  /** The runtime binary and any leading arguments (tests run a fake under node). */
  command: string[]
  /** The plugin patch: the model, the MCP server and the persona. */
  patch: string
  /** Variables the patch reads, such as the core token. */
  env: Record<string, string>
  provider: string
  model: string
  /** Longest wait for `initialize`. */
  startMs?: number
}

interface Message {
  id?: string | number
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: { message?: string }
}

export class Runtime {
  private waiters = new Map<string, (m: Message) => void>()
  private listeners = new Set<(m: Message) => void>()
  private stderr: string[] = []
  private closed = false

  private constructor(
    private proc: ChildProcessWithoutNullStreams,
    private home: string,
  ) {
    createInterface({ input: proc.stdout }).on('line', (line) => {
      let m: Message
      try {
        m = JSON.parse(line) as Message
      } catch {
        return
      }
      if (m.id !== undefined && !m.method) {
        const w = this.waiters.get(String(m.id))
        this.waiters.delete(String(m.id))
        w?.(m)
      } else if (m.method) {
        for (const l of this.listeners) l(m)
      }
    })
    createInterface({ input: proc.stderr }).on('line', (line) => {
      this.stderr.push(line)
      if (this.stderr.length > 50) this.stderr.shift()
    })
    proc.on('exit', () => this.close())
    // A binary that will not start, or a write after the runtime died, ends this runtime only.
    proc.on('error', () => this.close())
    proc.stdin.on('error', () => this.close())
  }

  static async start(opts: RuntimeOptions): Promise<Runtime> {
    // The runtime keeps its own state under DSH_HOME; each runtime gets a fresh one.
    const home = mkdtempSync(join(tmpdir(), 'bubbles-'))
    const [bin, ...args] = opts.command
    const proc = spawn(bin!, [...args, '--profile', 'sdk-minimal', '--patch', opts.patch], {
      env: { PATH: process.env.PATH ?? '', HOME: home, DSH_HOME: home, ...opts.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const runtime = new Runtime(proc, home)
    try {
      await runtime.request(
        'initialize',
        { cwd: home, provider: opts.provider, model: opts.model },
        opts.startMs ?? 30_000,
      )
    } catch (err) {
      runtime.kill()
      throw new Error(`the runtime did not start: ${(err as Error).message}\n${runtime.tail()}`)
    }
    return runtime
  }

  get alive() {
    return !this.closed
  }

  tail() {
    return this.stderr.slice(-10).join('\n')
  }

  private request(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error('the runtime has stopped'))
    const id = randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(id)
        reject(new Error(`${method} timed out`))
      }, timeoutMs)
      this.waiters.set(id, (m) => {
        clearTimeout(timer)
        if (m.error) reject(new Error(m.error.message ?? 'runtime error'))
        else resolve(m.result)
      })
      this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    })
  }

  /**
   * Runs one turn of a session and passes on its events; resolves when the turn has ended and
   * the session is idle. Rejects if the runtime stops first.
   */
  prompt(sessionId: string, text: string, onEvent: (e: RuntimeEvent) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      let ended = false
      const done = (err?: Error) => {
        this.listeners.delete(listen)
        this.listeners.delete(onClose)
        if (err) reject(err)
        else resolve()
      }
      const listen = (m: Message) => {
        if (m.params?.sessionId !== sessionId) return
        if (m.method === 'session.event') {
          const event = m.params.event as RuntimeEvent | undefined
          if (!event || typeof event.type !== 'string') return
          if (event.type === 'turn/end') ended = true
          onEvent({ type: event.type, data: event.data ?? {} })
        } else if (m.method === 'session.status' && m.params.status === 'idle' && ended) {
          done()
        }
      }
      const onClose = (m: Message) => {
        if (m.method === 'runtime/closed') done(new Error('the runtime stopped'))
      }
      this.listeners.add(listen)
      this.listeners.add(onClose)
      this.request('session/prompt', { sessionId, contentBlocks: [{ type: 'text', text }] }, 30_000)
        .then(() => undefined)
        .catch((err: Error) => done(err))
    })
  }

  /** Stops the runtime at once; any turn in progress rejects. */
  kill() {
    if (!this.closed) this.proc.kill('SIGKILL')
    this.close()
  }

  private close() {
    if (this.closed) return
    this.closed = true
    for (const w of this.waiters.values()) w({ error: { message: 'the runtime stopped' } })
    this.waiters.clear()
    for (const l of [...this.listeners]) l({ method: 'runtime/closed' })
    rmSync(this.home, { recursive: true, force: true })
  }
}
