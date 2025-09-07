# Repository Guidelines

## Project Structure & Module Organization

- `src/bot/`: Cloudflare Worker entry (`index.ts`) and webhook routes.
- `src/api/`: Lightweight Hono API (`server.ts`) for local/dev endpoints.
- `src/utils/`: Feature modules: `telegram/`, `nh/`, `pdf/`, `video/`, `telegraph/`, plus `test/` helpers.
- `src/types/`: Shared types (`env.ts`, `telegram.ts`, `video*.ts`).
- Tests are co-located next to code as `*.test.ts`.

## Build, Test, and Development Commands

- `yarn dev`: Run locally via Wrangler (persist local state).
- `yarn deploy`: Deploy to Cloudflare Workers.
- `yarn build`: TypeScript compile check (`tsc`).
- `yarn check`: Strict type check without emit.
- `yarn test:run`: Run all tests once. Use `--grep` or `<file>` to filter.
- `yarn test:coverage`: Generate V8 coverage (text/json/html).
- `yarn lint` / `yarn lint:fix`: ESLint check/fix for `src/**/*.ts`.
- `yarn format` / `yarn format:check`: Prettier write/check for `src/**/*.ts`.

## Coding Style & Naming Conventions

- Language: TypeScript (strict). Prefer explicit types and safe narrowing.
- Imports: Use path alias `@/*` (configured in `tsconfig.json`). Group by std/lib/local.
- Naming: camelCase (vars/functions), PascalCase (types/interfaces), kebab-case (file names if multiple words).
- Errors: Return typed results or throw with actionable messages; provide Telegraph fallback where appropriate.
- Workers: Use `executionCtx.waitUntil()` for async side-effects; avoid blocking requests.

## Testing Guidelines

- Framework: Vitest with `happy-dom`. Run `yarn test:run` locally.
- Placement: Co-located `*.test.ts` next to source.
- Utilities: Use `src/utils/test/mockR2Bucket.ts` and `src/utils/test/nock.ts` for R2 and HTTP mocking.
- Coverage: `yarn test:coverage` outputs HTML under `coverage/`. Keep meaningful assertions around edge cases and error paths.

## Commit & Pull Request Guidelines

- Commits: Clear, imperative subject (max ~72 chars). Include concise body explaining rationale; reference issues when relevant.
- PRs: Provide description, linked issues, testing steps, and screenshots/logs for behavior changes. Ensure lint, type check, and tests pass.

## Security & Configuration Tips

- Secrets/config: Use `wrangler.toml` and environment bindings (KV, R2, tokens). Do not commit secrets; prefer Wrangler secrets/vars.
- Webhooks: Set `X-Telegram-Bot-Api-Secret-Token` and webhook secrets; validate before processing.
