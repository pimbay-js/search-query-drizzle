# AGENTS.md — search-query-drizzle

## Project Overview

`@pimbay/search-query-drizzle` implements `@pimbay/search-query`'s adapter contracts over a Drizzle ORM query builder — `DrizzleSimpleAdapter`/`DrizzleIdentityAdapter`/`DrizzleFetchJoinSafeAdapter` — plus a search-terms-to-SQL condition builder.
`drizzle-orm` is a peer dependency (`>=0.44.0`), dialect-agnostic (pg-core/mysql-core/sqlite-core).
License: Unlicense. Minimum Node version: 22.

## Commands

```bash
npm install
npm run js:build           tsc -p tsconfig.build.json → dist/
npm run js:format          prettier --check . — check only
npm run js:format:fix      prettier --write .
npm run js:lint           # eslint src test — check only
npm run js:lint:fix       # eslint src test --fix
npm run js:typecheck      # tsc --noEmit
npm run test:22-drizzle44 # docker compose — Node 22 + drizzle-orm 0.44.0 (peerDependencies floor)
npm run test:22-drizzle45 # docker compose — Node 22 + drizzle-orm 0.45.2 (current latest)
npm run test:24-drizzle44 # docker compose — Node 24 + drizzle-orm 0.44.0
npm run test:24-drizzle45 # docker compose — Node 24 + drizzle-orm 0.45.2
npm run test:26-drizzle44 # docker compose — Node 26 + drizzle-orm 0.44.0
npm run test:26-drizzle45 # docker compose — Node 26 + drizzle-orm 0.45.2
npm run test:all          # all six test:*-drizzle* combos
npm run test:coverage     # vitest run --coverage test/unit test/functional
npm run test:functional   # vitest run test/functional (real SQLite via better-sqlite3)
npm run test:mutation     # stryker run — MSI 100 gate
npm run test:unit         # vitest run test/unit
```

`js:typecheck` is the authoritative type-safety gate — always run alongside `js:lint`/tests.
A bare command never mutates — only the `:fix` variant writes to disk.

## Code Style

- **Node 22+**, ESM only (`"type": "module"`), TypeScript `strict: true`.
- **ESLint** (`typescript-eslint` strict + stylistic type-checked) + **Prettier** — run `npm run js:lint:fix` / `js:format:fix`, don't hand-format.
- **Named exports only** — default exports are forbidden (enforced by lint rule).
- **`readonly` fields** by default on classes; prefer immutable result objects over mutation.
- **One class/concept per file**, barrel-exported from `src/index.ts`.
- **Comments** only where non-obvious, always English. TSDoc only for shapes the compiler can't infer.
- **Markdown**: semantic linebreaks — break at sentence end, never inside a list item.
- **Docs discipline**: no "Project Layout" in READMEs — the tree speaks for itself.

## Architecture

```
src/
  drizzleAdapter.ts   — DrizzleSimpleAdapter/DrizzleIdentityAdapter/DrizzleFetchJoinSafeAdapter over a Drizzle query builder.
  searchTermsQuery.ts — turns a @pimbay/search-query ParsedSearchTerms into a Drizzle SQL condition.
  sqlHelper.ts         — LIKE escaping helpers, shared by searchTermsQuery.
```

### Adapter/driver abstraction

The three adapter classes implement `@pimbay/search-query`'s `PageAdapter`/`SliceAdapter`/`CountableAdapter`/`HeadableAdapter`/`AllAdapter`/`IdentifiableAdapter` contracts over `LimitOffsetQuery<TRow>` — the shape any Drizzle Select query builder (pg-core/mysql-core/sqlite-core) satisfies.
One file, not one per class — the three share that same underlying shape and are small enough that splitting them apart would just scatter closely-related code.

## Public library mode

Always applies — every repo here is published on npm. Every exported-symbol change is a public API decision.

- **Always ask before**: new runtime `dependencies` entry, changing a public signature, new architectural pattern, touching >1 package at once.
- **Never without instruction**: delete a public export, rename an exported symbol, break wire/schema compatibility, add a build-affecting dev dependency.
- Two valid approaches → present both, no silent pick.
- Multi-file change → list files, confirm scope, then proceed.

## Testing

- **Vitest**, `test/unit/` always; `test/functional/` (real SQLite in-memory, via `better-sqlite3`) for anything that needs real SQL execution rather than a hand-mocked query builder.
- **`test/unit/`** — every collaborator faked (`LimitOffsetQuery` fakes, a `PgDialect` for SQL rendering), or the module has no external collaborator (`sqlHelper.ts`).
- **`test/functional/`** — runs against a real SQLite in-memory connection — don't mock what it can spin up for real.
- **Coverage: 100%** — hard gate; a dropped coverage change comes with new tests, not an exclusion.
- **Mutation testing: Stryker, min MSI 100%** (`npm run test:mutation`) — an escaped mutant needs a stronger assertion, not a suppressed mutator.

## Guardrails

- No new runtime dependency without proposing it explicitly.
- Targeted diffs — don't rewrite a file for a small fix.
- No unrequested docs/test scaffolding.
- Don't introduce a DI container, config loader, or logging framework — flag the need, don't silently add.
- Domain-vocabulary vs local-shape placement unclear → ask, don't guess.
- New failure case → check for an existing error (named constructor) before adding one.
- No query-builder-agnostic redesign — this package is deliberately Drizzle-specific, mirroring `search-query-doctrine`'s one-package-per-datasource split.
- A query passed into an adapter that calls `.orderBy()` needs `.$dynamic()` before it's handed over — otherwise the per-dialect select-builder types reject the adapter's own `.limit()`/`.offset()` calls.
