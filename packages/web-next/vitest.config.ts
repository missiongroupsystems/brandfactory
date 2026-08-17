import { fileURLToPath, URL } from "node:url";
import { defineProject } from "vitest/config";

/**
 * The first test project this package has had. Listed in the root `vitest.workspace.ts`, which
 * is the form that keeps `environment` and `alias` — `test.projects` in the root config
 * silently drops both (see the note in that file).
 *
 * Mirrors `packages/web/vitest.config.ts`: jsdom, globals, the `@` alias and a setup file. No
 * React plugin, because esbuild reads `jsx: "react-jsx"` from `tsconfig.json` and transforms
 * the TSX itself.
 *
 * **What belongs here.** Not the screens — the Operations Hub half of this app has no tests and
 * this is not the release that gives it any. Auth and workspace resolution are the first logic
 * in this package that is worth asserting rather than clicking: a token refresh, a sign-out
 * ordering and a landing-workspace fallback are all invisible in a browser pass until the day
 * they are wrong.
 */
export default defineProject({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    name: "@brandfactory/web-next",
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
