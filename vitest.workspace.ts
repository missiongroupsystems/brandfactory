// Workspace file for vitest. Each entry points to a per-package `vitest.config.ts`
// so environment/setup/alias settings from the package config (jsdom + `@/*`
// alias for web-next, node for connect and core) actually apply when tests are run
// from the root. `test.projects` in the root config silently dropped the
// per-project `environment` and `resolve.alias` when orchestrated from the
// top level; the workspace-file form honors them.
export default [
  'packages/web-next/vitest.config.ts',
  'packages/connect/vitest.config.ts',
  'packages/core/vitest.config.ts',
  'packages/bubbles/vitest.config.ts',
  'packs/brandbase/vitest.config.ts',
]
