/**
 * The SQL a pack version carries: named parameters bound to `$n`, and the check every statement
 * passes before a version is published. The check is the first wall; the runtime role's grants
 * (`migrations/0001_registry.sql`) are the second.
 */

type Token =
  | { kind: 'word'; text: string; quoted: boolean }
  | { kind: 'param'; name: string }
  | { kind: 'string' }
  | { kind: 'comment' }
  | { kind: 'semicolon' }
  | { kind: 'other'; text: string }

interface Located {
  token: Token
  start: number
  end: number
}

// As Postgres reads an identifier: any character past ASCII counts as a letter, and `$` may
// follow the first character. A narrower rule lets `é$$ … x$$` hide SQL inside what this check
// takes for a dollar-quoted string, while Postgres reads two identifiers.
const WORD = /[A-Za-z_\u0080-\uffff][A-Za-z0-9_$\u0080-\uffff]*/y
const PARAM = /:([A-Za-z_][A-Za-z0-9_]*)/y
const DOLLAR_TAG = /\$([A-Za-z_][A-Za-z0-9_]*)?\$/y

/** Splits SQL into the parts the binder and the check care about, skipping string contents. */
function tokenize(sql: string): Located[] {
  const out: Located[] = []
  let i = 0
  const push = (token: Token, start: number) => out.push({ token, start, end: i })
  while (i < sql.length) {
    const start = i
    const ch = sql[i]!
    const next = sql[i + 1]
    if (/\s/.test(ch)) {
      i++
    } else if (ch === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') i++
      push({ kind: 'comment' }, start)
    } else if (ch === '/' && next === '*') {
      const close = sql.indexOf('*/', i + 2)
      i = close === -1 ? sql.length : close + 2
      push({ kind: 'comment' }, start)
    } else if (ch === "'" || ((ch === 'E' || ch === 'e') && next === "'")) {
      i += ch === "'" ? 1 : 2
      while (i < sql.length) {
        if (sql[i] === '\\' && ch !== "'") i += 2
        else if (sql[i] === "'" && sql[i + 1] === "'") i += 2
        else if (sql[i] === "'") break
        else i++
      }
      i++
      push({ kind: 'string' }, start)
    } else if (ch === '"') {
      let text = ''
      i++
      while (i < sql.length) {
        if (sql[i] === '"' && sql[i + 1] === '"') {
          text += '"'
          i += 2
        } else if (sql[i] === '"') break
        else text += sql[i++]
      }
      i++
      push({ kind: 'word', text: text.toLowerCase(), quoted: true }, start)
    } else if (ch === '$' && (DOLLAR_TAG.lastIndex = i) >= 0 && DOLLAR_TAG.test(sql)) {
      const tag = sql.slice(i, DOLLAR_TAG.lastIndex)
      const close = sql.indexOf(tag, DOLLAR_TAG.lastIndex)
      i = close === -1 ? sql.length : close + tag.length
      push({ kind: 'string' }, start)
    } else if (ch === ':' && next === ':') {
      i += 2
      push({ kind: 'other', text: '::' }, start)
    } else if (ch === ':' && (PARAM.lastIndex = i) >= 0 && PARAM.test(sql)) {
      const name = sql.slice(i + 1, PARAM.lastIndex)
      i = PARAM.lastIndex
      push({ kind: 'param', name }, start)
    } else if ((WORD.lastIndex = i) >= 0 && WORD.test(sql)) {
      i = WORD.lastIndex
      push({ kind: 'word', text: sql.slice(start, i).toLowerCase(), quoted: false }, start)
    } else if (ch === ';') {
      i++
      push({ kind: 'semicolon' }, start)
    } else {
      i++
      push({ kind: 'other', text: ch }, start)
    }
  }
  return out
}

/** A value as Postgres takes it: objects and arrays as JSON text, a missing value as null. */
function toParam(value: unknown): unknown {
  if (value === undefined) return null
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    return JSON.stringify(value)
  }
  return value
}

/**
 * Binds `:name` parameters to `$1…$n`. A name the values lack binds null, so an optional input
 * field reads as null in SQL. `::type` casts and the inside of strings are left alone.
 */
export function bind(sql: string, values: Record<string, unknown>) {
  const names: string[] = []
  let text = ''
  let at = 0
  for (const { token, start, end } of tokenize(sql)) {
    if (token.kind !== 'param') continue
    let n = names.indexOf(token.name)
    if (n === -1) n = names.push(token.name) - 1
    text += sql.slice(at, start) + `$${n + 1}`
    at = end
  }
  text += sql.slice(at)
  return { text, params: names.map((name) => toParam(values[name])), names }
}

/** The statements a move or a rule may be. */
const FIRST = new Set(['select', 'insert', 'update', 'delete', 'with', 'values'])

/** Words that never belong in a move: other statements, and role or privilege changes. */
const WORDS = new Set([
  'execute',
  'copy',
  'reset',
  'grant',
  'revoke',
  'create',
  'alter',
  'drop',
  'truncate',
  'listen',
  'notify',
  'unlisten',
  'prepare',
  'deallocate',
  'discard',
  'call',
  'import',
])

/**
 * Functions a move may never call (the proposal's security rules). The runtime role cannot call
 * them either (`0001_registry.sql`); this check refuses the version before it is stored.
 */
const FUNCTIONS = new Set([
  'set_config',
  'pg_sleep',
  'pg_sleep_for',
  'pg_sleep_until',
  'pg_read_file',
  'pg_read_binary_file',
  'pg_ls_dir',
  'pg_stat_file',
  'pg_terminate_backend',
  'pg_cancel_backend',
  'pg_reload_conf',
  'pg_notify',
  'pg_logical_emit_message',
  'loread',
  'lowrite',
])
const FUNCTION_PREFIXES = ['dblink', 'lo_', 'pg_advisory', 'pg_try_advisory', 'xpath']
const FUNCTION_SUFFIXES = ['_to_xml', '_to_xmlschema', '_to_xml_and_xmlschema']

export function forbiddenFunction(name: string) {
  return (
    FUNCTIONS.has(name) ||
    FUNCTION_PREFIXES.some((p) => name.startsWith(p)) ||
    FUNCTION_SUFFIXES.some((s) => name.endsWith(s))
  )
}

/**
 * Why a statement may not be stored in a pack version, or null when it may. One statement of a
 * listed kind, no comments, no `SELECT … INTO`, no listed word or function, quoted or not.
 */
export function sqlProblem(sql: string): string | null {
  const tokens = tokenize(sql).map((t) => t.token)
  if (tokens.length === 0) return 'empty statement'
  if (tokens.some((t) => t.kind === 'comment')) return 'comments are not allowed'
  const semicolon = tokens.findIndex((t) => t.kind === 'semicolon')
  if (semicolon !== -1 && semicolon !== tokens.length - 1) return 'one statement only'
  const first = tokens[0]!
  if (first.kind !== 'word' || !FIRST.has(first.text)) {
    return 'a statement starts with SELECT, INSERT, UPDATE, DELETE, WITH or VALUES'
  }
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!
    if (t.kind === 'other' && t.text === '$') return 'use :name parameters, not $n'
    if (t.kind !== 'word') continue
    // U&"…" spells an identifier in escapes, which would hide a name from this check.
    if (t.text === 'u' && tokens[i + 1]?.kind === 'other') {
      const amp = tokens[i + 1] as { text: string }
      if (amp.text === '&') return 'U& identifiers are not allowed'
    }
    if (WORDS.has(t.text)) return `"${t.text}" is not allowed`
    if (forbiddenFunction(t.text)) return `${t.text} is not allowed`
    if (t.text === 'into') {
      const prev = tokens[i - 1]
      if (!(prev?.kind === 'word' && (prev.text === 'insert' || prev.text === 'merge'))) {
        return 'SELECT … INTO is not allowed'
      }
    }
  }
  return null
}

/** True when a statement can change rows: an INSERT, UPDATE or DELETE anywhere in it. */
export function writes(sql: string): boolean {
  return tokenize(sql).some(
    ({ token: t }) =>
      t.kind === 'word' && !t.quoted && ['insert', 'update', 'delete'].includes(t.text),
  )
}
