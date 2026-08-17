import js from '@eslint/js'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/out/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/drizzle/**',
      '**/*.config.js',
      '**/*.config.cjs',
      '**/*.config.mjs',
      '**/*.config.ts',
      '**/scripts/*.mjs',
      '**/vitest.workspace.ts',
      // Vendored upstream — pixel-point/toolcraft @ 682a159, MIT. Kept
      // verbatim so it can be diffed against upstream when toolcraft moves;
      // lint rules encode *our* authoring conventions and do not apply to code
      // we did not author and intend to re-sync. See the tree's own README.
      //
      // **Types are deliberately NOT exempted.** `pnpm typecheck` covers this
      // directory in full and passes — our code consumes these types, so they
      // have to hold. Style is upstream's business; the contract is ours.
      'packages/web/src/toolcraft/**',
      // The Next frontend lints itself, with `eslint-config-next` and its own flat config
      // (`pnpm -F @brandfactory/web-next lint`). It is exempt here for the same mechanical
      // reason as the tree above — the root config's `projectService` has no tsconfig
      // project covering these files, so type-aware rules error on every one of them
      // rather than reporting anything real. See `docs/executing/next-frontend-adoption-plan.md`.
      'packages/web-next/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },
  {
    files: ['packages/web/src/**/*.{ts,tsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
  },
  prettier,
)
