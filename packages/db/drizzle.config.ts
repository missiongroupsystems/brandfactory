import { defineConfig } from 'drizzle-kit'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required to run drizzle-kit')
}

export default defineConfig({
  schema: './src/schema/**/*.ts',
  out: './drizzle',
  dialect: 'postgresql',
  // `schemaFilter` defaults to `['public']`. Left alone, drizzle-kit does not
  // just skip the Passport projection — it treats those tables as unmanaged, so
  // `db:generate` emits nothing for them and a later run could propose dropping
  // them. Naming `passport` here is what puts the read model under migration
  // control alongside everything else.
  schemaFilter: ['public', 'passport'],
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
})
