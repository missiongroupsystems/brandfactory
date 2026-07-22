// Applies pending drizzle migrations against DATABASE_URL. Plain node (no
// tsx) so the Fly release command can run it inside the production image:
//   cd node_modules/@brandfactory/db && node scripts/migrate.mjs
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const here = path.dirname(fileURLToPath(import.meta.url))
const migrationsFolder = path.resolve(here, '..', 'drizzle')

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
try {
  await migrate(drizzle(pool), { migrationsFolder })
  console.log(`migrations applied from ${migrationsFolder}`)
} finally {
  await pool.end()
}
