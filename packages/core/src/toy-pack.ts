import { type PackContent } from './pack'

/**
 * A pack with no business in it, for the core's own tests: people keep notes, and each person
 * sees only their own.
 */
export function toyPack(version = '1.0.0', over: Partial<PackContent> = {}): PackContent {
  return {
    manifest: {
      name: 'toy',
      version,
      errors: { notes_pkey: { status: 409, code: 'NOTE_TAKEN', message: 'that id is taken' } },
    },
    migrations: [
      {
        name: '0001_notes.sql',
        sql: `
          create schema toy;
          create table toy.notes (
            id text primary key,
            owner text not null,
            body text not null
          );
          alter table toy.notes enable row level security;
          alter table toy.notes force row level security;
          create policy own on toy.notes
            using (owner = current_setting('app.user_id', true))
            with check (owner = current_setting('app.user_id', true));
          grant usage on schema toy to pack_runtime;
          grant select, insert, update, delete on toy.notes to pack_runtime;
        `,
      },
    ],
    ontology: { notes: 'a line of text a person keeps for themselves' },
    ops: {
      'note.list': {
        name: 'note.list',
        description: "The caller's notes, by id.",
        input: { type: 'object', additionalProperties: false, properties: {} },
        sql: 'select id, body from toy.notes order by id',
        returns: 'many',
      },
      'note.add': {
        name: 'note.add',
        description: 'Adds a note.',
        input: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'body'],
          properties: {
            id: { type: 'string', pattern: '^[a-z0-9-]{1,40}$' },
            body: { type: 'string', minLength: 1, maxLength: 200 },
          },
        },
        sql: 'insert into toy.notes (id, owner, body) values (:id, :actor, :body) returning id, body',
        returns: 'one',
        before: ['note.quiet'],
      },
      'note.give': {
        name: 'note.give',
        description: 'Writes a note in another person’s name; row rules refuse it.',
        input: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'to'],
          properties: { id: { type: 'string' }, to: { type: 'string' } },
        },
        sql: `insert into toy.notes (id, owner, body) values (:id, :to, 'hi') returning id`,
        returns: 'one',
      },
      'note.drop': {
        name: 'note.drop',
        description: 'Deletes one of the caller’s notes.',
        input: {
          type: 'object',
          additionalProperties: false,
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        sql: 'delete from toy.notes where id = :id returning id',
        returns: 'one',
      },
    },
    rules: {
      'note.quiet': {
        id: 'note.quiet',
        sql: 'select :body::text <> upper(:body::text) as ok',
        status: 400,
        code: 'SHOUTING',
        message: 'a note is not all capitals',
      },
    },
    fixture: '',
    tests: [],
    ...over,
  }
}
