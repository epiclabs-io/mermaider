# Repository instructions

- Use `apps/<app>/src` and `apps/<app>/tests` for applications and `lib/<package>` for shared libraries.
- Follow `.prettierrc` and `eslint.config.js`, matching vecs: braces on every conditional, no unused imports.
- Before committing, run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run format:check`.
- Pre-commit runs typechecking, lint-staged formatting/lint fixes, and a full formatting check. Do not bypass hooks.
- Commit messages use `<type>: <subject>` without a scope and a body describing intent, behavior, and verification.
- Write Vitest tests for public behavior and regressions under the affected workspace's `tests/` directory.
- Work targets `dev`. Releases come from merges into `master`; see `architecture/chrome-web-store.md`.
