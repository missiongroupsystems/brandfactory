import { describe, expect, it } from 'vitest'
import { bind, closes, inline, literal, sqlProblem, withoutSemicolon, writes } from './sql'

describe('binding', () => {
  it('numbers each name once and leaves casts and strings alone', () => {
    const out = bind('select :a::text, \':b\' as s, :a, "x:y", $$ :c $$ from t where c = :c', {
      a: 1,
      c: { k: 2 },
    })
    expect(out.text).toBe('select $1::text, \':b\' as s, $1, "x:y", $$ :c $$ from t where c = $2')
    expect(out.params).toEqual([1, '{"k":2}'])
  })

  it('binds a missing value as null', () => {
    expect(bind('select :gone', {}).params).toEqual([null])
  })
})

describe('the SQL check', () => {
  it.each([
    'select 1',
    'with x as (update t set a = 1 returning a) select * from x',
    'insert into t (a) values (:a) on conflict (a) do nothing returning a',
    'delete from t where id = :id returning id',
    'select role, "set" from t for update',
    "select 'reset role; set_config' as words",
  ])('passes %s', (sql) => {
    expect(sqlProblem(sql)).toBeNull()
  })

  it.each([
    ['two statements', 'select 1; select 2'],
    ['a role change', 'reset role'],
    ['a SET', 'set role postgres'],
    ['set_config', "select set_config('app.user_id', 'x', true)"],
    ['set_config, quoted', `select "set_config"('app.user_id', 'x', true)`],
    ['set_config, qualified', "select pg_catalog.set_config('a', 'b', false)"],
    ['an escaped identifier', `select U&"\\0073et_config"('a', 'b', true)`],
    ['pg_sleep', 'select pg_sleep(10)'],
    ['query_to_xml', "select query_to_xml('select * from packs.loadouts', true, true, '')"],
    ['the prepared statements view', 'select statement from pg_catalog.pg_prepared_statements'],
    ['the prepared statements view, quoted', 'select * from "pg_prepared_statements"'],
    ['the prepared statements function', 'select * from pg_prepared_statement()'],
    [
      'the prepared statements function, qualified',
      'select * from pg_catalog.pg_prepared_statement()',
    ],
    ['dblink', "select * from dblink('x', 'y')"],
    ['a large object', 'select lo_import(1)'],
    ['an advisory lock', 'select pg_advisory_lock(1)'],
    ['COPY', 'copy t to stdout'],
    ['DO', 'do $$ begin end $$'],
    ['SELECT INTO', 'select * into newtable from t'],
    ['a comment', 'select 1 -- hidden'],
    ['positional parameters', 'select $1'],
    ['DDL', 'select 1 from t where exists (select 1) and drop'],
    // Postgres reads é$$ as an identifier; a check that reads $$ there would see a string.
    ['SQL hidden behind a non-ASCII identifier', 'select 1 as é$$; reset role; select 1 as x$$'],
    ['a function hidden the same way', "select 1 as é$$, set_config('a', 'b', true) as x$$"],
    // A read sends its statements among the core's own: one left open takes in what follows.
    ['a dollar quote that does not end', 'select $v$'],
    ['a string that does not end', "select 'x"],
    ['an escape string that does not end', "select e'x\\'"],
    ['a quoted name that does not end', 'select "x'],
    ['a block comment that does not end', 'select 1 /* x'],
  ])('refuses %s', (_why, sql) => {
    expect(sqlProblem(sql)).not.toBeNull()
  })
})

describe('statements among the core’s own (a read in one trip)', () => {
  it('quotes a value so nothing in it can end the quote, whatever it holds', () => {
    for (const v of ['plain', '$v$', 'ends in $v', 'ends in $', '$vv$ and $v$', "it's", '']) {
      const q = literal(v)
      const tag = q.slice(0, q.indexOf('$', 1) + 1)
      expect(q.startsWith(tag) && q.endsWith(tag)).toBe(true)
      expect(q.slice(tag.length, -tag.length)).toBe(v)
      // The closing tag appears once, at the end: the value cannot end the quote early.
      expect(`${v}${tag}`.indexOf(tag)).toBe(v.length)
    }
  })

  it('writes each value as node-pg would send it, null as null', () => {
    expect(literal(null)).toBe('null')
    expect(literal(undefined)).toBe('null')
    expect(literal(5)).toBe('$v$5$v$')
    expect(literal(true)).toBe('$v$true$v$')
    expect(literal({ a: [1] })).toBe('$v${"a":[1]}$v$')
    expect(literal(new Date('2026-10-21T00:00:00Z'))).toBe('$v$2026-10-21T00:00:00.000Z$v$')
  })

  it('puts values at the parameters only, never inside strings, names or casts', () => {
    expect(inline(`select :a::int, ':a', ":a", $$ :a $$ where x = :b`, { a: 1, b: "o'k" })).toBe(
      `select $v$1$v$::int, ':a', ":a", $$ :a $$ where x = $v$o'k$v$`,
    )
  })

  it('drops only a final semicolon', () => {
    expect(withoutSemicolon('select 1;')).toBe('select 1')
    expect(withoutSemicolon("select ';'")).toBe("select ';'")
  })

  it('lets only a statement whose quotes all end go among others', () => {
    expect(closes('select \'a\', "b", $q$c$q$')).toBe(true)
    for (const open of ['select $v$', "select 'a", 'select "a', 'select 1 /* a', 'select 1 -- a']) {
      expect(closes(open)).toBe(false)
    }
    // Closed as the check reads it, open on a server with standard_conforming_strings off.
    expect(closes("select 'a\\'")).toBe(false)
    expect(closes("select e'a\\'b'")).toBe(true)
    // Postgres before 15 reads a number and a dollar quote here; this check, a number and a name.
    for (const odd of ['select 1e5$a$', 'select 1.5e$a$', 'select 0b1$a$', 'select 0x1F']) {
      expect(closes(odd)).toBe(false)
    }
    expect(closes("select a1, 1.5, -2, t.c1 from x where n = 10 and d = '2026-10-21'")).toBe(true)
  })
})

describe('the kind of a move', () => {
  it('is a write when the statement can change rows, wherever the change sits', () => {
    expect(writes('select * from t')).toBe(false)
    expect(writes("select 'update' from t")).toBe(false)
    expect(writes('with x as (delete from t returning *) select * from x')).toBe(true)
  })
})
