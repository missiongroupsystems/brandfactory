import { defineConfig } from 'drizzle-kit'

// `generate` reads only the schema and needs no database.
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['brandbase'],
})
