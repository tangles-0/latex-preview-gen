---
name: web-testing
description: >-
  Tests the Latex preview worker. Use when implementing jobs, integrations,
  route validation, retries, or media processing.
---

# Web testing

- Unit/integration runner: Vitest
- Tests: colocated `*.test.ts` files under `src/`
- Install: `pnpm install`
- Tests: `pnpm test`
- Types: `pnpm exec tsc --noEmit`
- Lint: `pnpm exec eslint .`
- Production build: `pnpm build`

Test validation, timeout and queue rules, process/API error handling, and pure
payload transformations. Mock network and process boundaries where practical.
