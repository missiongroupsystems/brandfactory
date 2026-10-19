import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { Ajv } from 'ajv'
import { readMigrations, type Migration } from './migrate'
import { migrationProblem, sqlProblem, writes } from './sql'

/** A refusal a pack names: the HTTP status, a stable code for screens, and words for people. */
export interface Refusal {
  status: number
  code: string
  message: string
}

/**
 * A rule: one SQL statement returning one row with a boolean `ok` (and, if it likes, a
 * `details` value handed back with the refusal). `ok` false refuses the call.
 */
export interface Rule extends Refusal {
  id: string
  sql: string
}

/** A move: one action, as data. */
export interface Op {
  name: string
  description: string
  /** JSON Schema for the input; the top level is an object. */
  input: Record<string, unknown>
  /** One statement, run under row-level security with the input bound by name. */
  sql: string
  /** `one`: exactly one row, else `empty` (404 by default). `many`: every row. */
  returns: 'one' | 'many'
  empty?: Refusal
  /** Rule ids checked before the statement runs, in order. */
  before?: string[]
  /** Rule ids checked after it ran, in the same transaction. */
  after?: string[]
  /**
   * An effect move reaches outside the app through a connector the core holds. `payload` is one
   * read-only statement that says exactly what goes out; a person approves that, and `sql` then
   * records the connector's answer, bound as `:outcome`.
   */
  connector?: string
  payload?: string
  /**
   * A move a guest calls with no sign-in (`POST /guest/:pack/:op`), authorised by the capability
   * in the named input field (a link's token): the core sets it as `claims.capability()`, with no
   * person, and the pack's row rules decide what it opens. Never an effect.
   */
  guest?: { capability: string }
  /**
   * A move that makes a file's record: the core passes a new key as `:file`, the move answers
   * `upload: {key, type}` (the row's key, new or kept), and the core turns that into a signed
   * write URL and the file's stable address `src`. `type` names the input field with its type.
   */
  upload?: { type: string }
}

export interface PackTest {
  name: string
  [key: string]: unknown
}

export interface Manifest {
  name: string
  version: string
  description?: string
  /** A constraint or trigger name mapped to the refusal a caller reads. */
  errors?: Record<string, Refusal>
  /**
   * Moves the scheduler calls when a scheduled call ends badly, as the principal who asked, with
   * `{ call, input, code?, message? }`: refused (no person's yes, say), or cut off mid-run.
   */
  scheduler?: { onRefused?: string; onUnknown?: string }
}

/** Everything a version holds. Frozen once published; its hash names it. */
export interface PackContent {
  manifest: Manifest
  migrations: Migration[]
  ontology: unknown
  ops: Record<string, Op>
  rules: Record<string, Rule>
  fixture: string
  tests: PackTest[]
}

export type OpKind = 'read' | 'write' | 'effect'

/**
 * Set by the core from what a move is, never from a field the pack can edit: a move that names a
 * connector is an effect (the only way out of the app, and it always needs a person's yes); a
 * statement that can change rows is a write.
 */
export function kindOf(op: Op): OpKind {
  if (op.connector !== undefined) return 'effect'
  return writes(op.sql) ? 'write' : 'read'
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function readDir<T>(dir: string): T[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => readJson(path.join(dir, f)) as T)
}

/** Reads a pack directory into the content a version freezes. */
export function readPack(dir: string): PackContent {
  const ops = readDir<Op>(path.join(dir, 'ops'))
  const rules = readDir<Rule>(path.join(dir, 'rules'))
  const fixture = path.join(dir, 'tests', 'fixture.sql')
  const ontology = path.join(dir, 'ontology.json')
  const migrations = path.join(dir, 'migrations')
  return {
    manifest: readJson(path.join(dir, 'manifest.json')) as Manifest,
    migrations: existsSync(migrations) ? readMigrations(migrations) : [],
    ontology: existsSync(ontology) ? readJson(ontology) : null,
    ops: Object.fromEntries(ops.map((o) => [o.name, o])),
    rules: Object.fromEntries(rules.map((r) => [r.id, r])),
    fixture: existsSync(fixture) ? readFileSync(fixture, 'utf8') : '',
    tests: readDir<PackTest>(path.join(dir, 'tests')),
  }
}

/** JSON with keys in order, so the same content always hashes the same. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort()
    const obj = value as Record<string, unknown>
    return `{${keys
      .filter((k) => obj[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export function hashOf(content: PackContent): string {
  return createHash('sha256').update(canonical(content)).digest('hex')
}

/**
 * Parameters every statement may read beside the input; no input field may take these names.
 * `fields` is the whole input as JSON, so a statement can tell a field sent as null from one not
 * sent (`:fields::jsonb ? 'why'`).
 */
export const RESERVED = ['now', 'actor', 'agent', 'outcome', 'payload', 'fields', 'file']

// No `__` and no `_` at the end of a part: an MCP tool name writes the dots as `__`.
const NAME = /^[a-z](_?[a-z0-9])*(\.[a-z](_?[a-z0-9])*)*$/
const STATUSES = new Set([400, 403, 404, 409, 422])

function refusalProblem(where: string, r: Partial<Refusal>): string | null {
  if (!r.status || !STATUSES.has(r.status))
    return `${where}: status is one of 400, 403, 404, 409, 422`
  if (!r.code || !/^[A-Z][A-Z0-9_]*$/.test(r.code)) return `${where}: code is UPPER_SNAKE`
  if (!r.message) return `${where}: a message is required`
  return null
}

/** Every reason a version may not be published; empty when it may. */
export function packProblems(content: PackContent): string[] {
  const out: string[] = []
  const { manifest, ops, rules } = content
  if (!manifest?.name || !NAME.test(manifest.name)) out.push('manifest: name is lower_snake')
  if (!manifest?.version) out.push('manifest: version is required')
  for (const which of ['onRefused', 'onUnknown'] as const) {
    const op = manifest?.scheduler?.[which]
    if (op !== undefined && !ops[op]) out.push(`manifest: scheduler.${which} names no move ${op}`)
  }
  for (const [name, refusal] of Object.entries(manifest?.errors ?? {})) {
    const p = refusalProblem(`errors.${name}`, refusal)
    if (p) out.push(p)
  }
  for (const m of content.migrations ?? []) {
    const p = migrationProblem(m.sql)
    if (p) out.push(`migration ${m.name}: ${p}`)
  }
  const ajv = new Ajv({ strict: true })
  for (const [id, rule] of Object.entries(rules)) {
    if (id !== rule.id || !NAME.test(id)) out.push(`rule ${id}: id is dotted lower_snake`)
    const p = sqlProblem(rule.sql ?? '') ?? refusalProblem(`rule ${id}`, rule)
    if (p) out.push(`rule ${id}: ${p}`)
  }
  for (const [name, op] of Object.entries(ops)) {
    if (name !== op.name || !NAME.test(name)) out.push(`op ${name}: name is dotted lower_snake`)
    if (!op.description) out.push(`op ${name}: a description is required`)
    if (op.returns !== 'one' && op.returns !== 'many') out.push(`op ${name}: returns one or many`)
    const p = sqlProblem(op.sql ?? '')
    if (p) out.push(`op ${name}: ${p}`)
    if (op.connector !== undefined || op.payload !== undefined) {
      if (!op.connector || !/^[a-z][a-z0-9_]*$/.test(op.connector)) {
        out.push(`op ${name}: an effect names its connector in lower_snake`)
      }
      const p = op.payload === undefined ? 'an effect needs a payload' : sqlProblem(op.payload)
      if (p) out.push(`op ${name}: payload: ${p}`)
      else if (writes(op.payload!)) out.push(`op ${name}: payload: it reads, it never writes`)
    }
    if (op.guest !== undefined) {
      const field = op.guest.capability
      const props = (op.input?.properties ?? {}) as Record<string, { type?: unknown }>
      const required = (op.input?.required ?? []) as string[]
      if (!field || props[field]?.type !== 'string' || !required.includes(field)) {
        out.push(`op ${name}: a guest move's capability is a required string input`)
      }
      if (op.connector !== undefined) out.push(`op ${name}: a guest move never reaches outside`)
    }
    if (op.upload !== undefined) {
      const field = op.upload.type
      const props = (op.input?.properties ?? {}) as Record<string, { type?: unknown }>
      const required = (op.input?.required ?? []) as string[]
      if (!field || props[field]?.type !== 'string' || !required.includes(field)) {
        out.push(`op ${name}: an upload move's type is a required string input`)
      }
      if (op.guest !== undefined || kindOf(op) !== 'write') {
        out.push(`op ${name}: an upload move is a write for a signed-in caller`)
      }
    }
    if (op.empty) {
      const e = refusalProblem(`op ${name}.empty`, op.empty)
      if (e) out.push(e)
    }
    if (op.input?.type !== 'object') out.push(`op ${name}: input is an object schema`)
    const fields = Object.keys((op.input?.properties as object | undefined) ?? {})
    for (const f of fields.filter((f) => RESERVED.includes(f))) {
      out.push(`op ${name}: the input field ${f} is reserved`)
    }
    try {
      ajv.compile(op.input ?? {})
    } catch (err) {
      out.push(`op ${name}: input schema: ${(err as Error).message}`)
    }
    for (const id of [...(op.before ?? []), ...(op.after ?? [])]) {
      if (!rules[id]) out.push(`op ${name}: no rule ${id}`)
    }
  }
  return out
}
