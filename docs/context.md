# Context

> Working memory, not a historical record.
> Continuously edited, not append-only — unlike DECISIONS.md.
> When something here resolves: delete it if it was only ever local/temporary, or promote it to DECISIONS.md if it turned out to matter beyond this moment.
> Don't let resolved items pile up here.

## Current focus

`src/` built: `sqlHelper.ts`, `searchTermsQuery.ts`, single `drizzleAdapter.ts` holding `DrizzleSimpleAdapter`, `DrizzleIdentityAdapter`, `DrizzleFetchJoinSafeAdapter`.

## Open questions

- None open right now.

## Known limitations / non-goals (for now)

- No `CursorAdapter` implementation.
- No aggregation-composition helper (e.g. pagination + a `GROUP BY` breakdown in one response) — deliberately out of scope for this package.
- `count()` doesn't account for an existing `GROUP BY` on the consumer's query.

## Implementation notes

- `DrizzleFetchJoinSafeAdapter` takes `buildRowsForIds` rather than trying to derive a joined row-fetch generically — Drizzle has no entity hydration to lean on the way Doctrine ORM's `Paginator` does, so the caller supplies the (typically relational-query-API) fetch itself.
- `LimitOffsetQuery<TRow>` is the shared shape all three adapters build on; a query passed in that already called `.orderBy()` needs `.$dynamic()` first, or the per-dialect select-builder types reject the adapter's own later `.limit()`/`.offset()` calls.
- `LIKE`/`NOT LIKE` conditions always carry an explicit `ESCAPE '\'` clause (built via the `sql` tag, not the `like()`/`notLike()` helpers, which don't support one) — redundant on Postgres/MySQL/MariaDB, required on SQLite/SQL Server/Oracle. Emitted unconditionally rather than branching per dialect.
- No `BaseAdapter`/shared parent between `DrizzleFetchJoinSafeAdapter` and `DrizzleSimpleAdapter` — their `count()` bodies are identical but each adapter answers a structurally different question (root count vs. joined-row count would otherwise diverge), so duplication here is cheaper than a shared base that would need to explain why it's safe to share.

## Ideas / future plans

- A `CursorAdapter` implementation once its constructor shape (explicit keyset column(s)) is resolved.
- `escapeLikeValue`/`likeEscapeClause` currently assume a single-char escape sequence; revisit if a consumer needs a multi-char one.
