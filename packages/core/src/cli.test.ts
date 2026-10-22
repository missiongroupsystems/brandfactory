import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const core = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

describe('the command line', () => {
  // The image runs it as `tsx node_modules/@brandfactory/core/src/cli.ts migrate` (fly.toml's
  // release command), and that folder is a symlink. A CLI that did nothing there would let every
  // deploy pass without its migrations.
  it('runs when reached through a symlink, as in the image', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'core-cli-'))
    try {
      symlinkSync(core, path.join(dir, 'core'))
      const run = spawnSync(
        path.join(core, 'node_modules/.bin/tsx'),
        [path.join(dir, 'core/src/cli.ts'), 'no-such-command'],
        { encoding: 'utf8', env: { ...process.env, FILES_SECRET: 'x', AGENT_SECRET: 'y' } },
      )
      expect(run.stderr).toMatch(/core <command>/)
      expect(run.status).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
