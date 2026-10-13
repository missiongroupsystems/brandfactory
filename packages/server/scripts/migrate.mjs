// Applies pending migrations to DATABASE_URL. Plain node, so a deploy can run it from the image:
//   node scripts/migrate.mjs
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'drizzle')
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
try {
  // Our own journal schema: the archive's migrations keep theirs in `drizzle`, and the two must
  // never read each other's history.
  await migrate(drizzle(pool), { migrationsFolder, migrationsSchema: 'brandbase_drizzle' })
  console.log(`migrations applied from ${migrationsFolder}`)
} finally {
  await pool.end()
}
