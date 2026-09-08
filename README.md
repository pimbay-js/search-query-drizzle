# @pimbay/search-query-drizzle

[![npm version](https://img.shields.io/npm/v/%40pimbay%2Fsearch-query-drizzle?style=flat-square&color=blue)](https://www.npmjs.com/package/@pimbay/search-query-drizzle)
[![Node Version](https://img.shields.io/badge/node-%3E%3D22-339933?style=flat-square&logo=node.js)](https://nodejs.org)
[![License](https://img.shields.io/npm/l/%40pimbay%2Fsearch-query-drizzle?style=flat-square&color=green)](LICENSE)
[![Code Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen?style=flat-square)](https://codeberg.org/pimbay-js/search-query-drizzle)
[![Mutation Score](https://img.shields.io/badge/MSI-100%25-brightgreen?style=flat-square)](https://codeberg.org/pimbay-js/search-query-drizzle)

[Drizzle ORM](https://orm.drizzle.team/) adapters and a search-terms-to-SQL condition builder for [`@pimbay/search-query`](https://www.npmjs.com/package/@pimbay/search-query).

## Installation

```bash
npm install @pimbay/search-query-drizzle @pimbay/search-query drizzle-orm
```

## Usage

## Pagination adapters

`DrizzleSimpleAdapter` covers the common case: one `FROM`/`JOIN`/`WHERE` shape, where the count query and the row query only differ in `SELECT` projection.

```ts
import { DrizzleSimpleAdapter } from '@pimbay/search-query-drizzle';
import { paginatePage } from '@pimbay/search-query';
import { db } from './db.js';
import { widgets } from './schema.js';
import { count, eq } from 'drizzle-orm';

const adapter = new DrizzleSimpleAdapter(
  () => db.select({ value: count() }).from(widgets).where(eq(widgets.active, true)),
  (row) => row.value,
  () => db.select().from(widgets).where(eq(widgets.active, true)),
);

const page = await paginatePage(adapter, 1, 20);
```

Need `ids()` too (e.g. for a union-find or bulk operation over the whole filtered set)? Use `DrizzleIdentityAdapter` instead — it takes an extra `buildIdQuery`/`extractId` pair. Drizzle can't cheaply reproject an existing query, so it runs as its own query rather than reusing the row query.

Both adapters implement `PageAdapter`/`SliceAdapter`/`CountableAdapter`/`HeadableAdapter`/`AllAdapter` from `@pimbay/search-query` — use whichever `paginate*` function from that package fits your use case.

> [!IMPORTANT]
> If `buildRowQuery`/`buildIdQuery` call `.orderBy()` (needed for any stable pagination), call `.$dynamic()` somewhere in the chain first — anywhere before `.orderBy()` works, not just at the very end. Without it, TypeScript's per-dialect select-builder types won't allow the adapter's own `.limit()`/`.offset()` calls afterwards — see [Drizzle's docs on dynamic query building](https://orm.drizzle.team/docs/dynamic-query-building).

### Joined to-many queries

A plain `LIMIT`/`OFFSET` over a query that fetch-joins a to-many relation (one SQL row per joined child, not per root) will miscount and truncate mid-collection. `DrizzleFetchJoinSafeAdapter` avoids this with an explicit two-step split: `buildIdPageQuery` selects only the _distinct root ids_ for the requested page (no joined columns), then `buildRowsForIds` re-fetches the full row shape for exactly those ids — typically via Drizzle's relational query API, which does its own duplicate-free stitching:

```ts
import { DrizzleFetchJoinSafeAdapter } from '@pimbay/search-query-drizzle';
import { paginatePage } from '@pimbay/search-query';
import { count, inArray } from 'drizzle-orm';
import { db } from './db.js';
import { products } from './schema.js';

const adapter = new DrizzleFetchJoinSafeAdapter(
  () => db.select({ value: count() }).from(products),
  (row) => row.value,
  () => db.select({ id: products.id }).from(products).orderBy(products.id).$dynamic(),
  (row) => row.id,
  (ids) => db.query.products.findMany({ where: inArray(products.id, [...ids]), with: { tags: true } }),
);

const page = await paginatePage(adapter, 1, 20);
```

`PageAdapter`/`CountableAdapter` only — see the JSDoc on `DrizzleFetchJoinSafeAdapter` for why `Slice`/`Headable`/`All`/`Identifiable` aren't offered here.

## Search terms → SQL condition

```ts
import { buildSearchTermsConditionFromString } from '@pimbay/search-query-drizzle';
import { createSearchTermsConfig } from '@pimbay/search-query';
import { and, eq } from 'drizzle-orm';
import { db } from './db.js';
import { widgets } from './schema.js';

const config = createSearchTermsConfig();
const condition = buildSearchTermsConditionFromString(widgets.name, 'foo* -bar', config);

await db
  .select()
  .from(widgets)
  .where(and(eq(widgets.active, true), condition));
```

`and()`/`or()` from `drizzle-orm` treat `undefined` as "no condition", and `buildSearchTermsCondition`/`buildSearchTermsConditionFromString` return `undefined` when no terms survive `minLength` — so this composes directly into an existing `where()` without a null check.

Equals/likes are OR-grouped, negated equals/likes are AND-grouped, and the two groups are ANDed together.
LIKE values are escaped (`escapeLikeValue`, also exported) before the wildcard character is turned into `%`, and every `LIKE`/`NOT LIKE` carries an explicit `ESCAPE '\'` clause — redundant-but-harmless on Postgres/MySQL/MariaDB (which already default to `\`), required on SQLite/SQL Server/Oracle (which don't).

## Development Helpers

```bash
npm run js:lint       # eslint (check only)
npm run js:lint:fix   # same, applies the fix
npm run js:format     # prettier --check .
npm run js:format:fix # same, applies the fix
npm run js:typecheck  # tsc --noEmit
```

## Architecture & Decisions

- **[docs/context.md](docs/context.md)** — current working state: what's in progress, what's next.
- **[docs/DECISIONS.md](docs/DECISIONS.md)** — why things are built the way they are, in the order the decisions were made.
- **[docs/CHANGELOG.md](docs/CHANGELOG.md)** — version history.

## License

[Unlicense](LICENSE) — public domain. Part of the [PimBay](https://pimbay.dev) ecosystem.

Bundled third-party dependencies and their licenses: **[docs/THIRD-PARTY-NOTICES.md](docs/THIRD-PARTY-NOTICES.md)**.
