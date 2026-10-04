# Context

> Working memory, not a historical record.
> Continuously edited, not append-only — unlike DECISIONS.md.
> When something here resolves: delete it if it was only ever local/temporary, or promote it to DECISIONS.md if it turned out to matter beyond this moment.
> Don't let resolved items pile up here.

## Current focus

Nothing in progress right now.

## Open questions

- None open right now.

## Known limitations / non-goals (for now)

- No `CursorAdapter` implementation.
- No aggregation-composition helper (e.g. pagination + a `GROUP BY` breakdown in one response) — deliberately out of scope for this package.
- `count()` doesn't account for an existing `GROUP BY` on the consumer's query.

## Implementation notes

- No `BaseAdapter`/shared parent between `DrizzleFetchJoinSafeAdapter` and `DrizzleSimpleAdapter` — their `count()` bodies are identical but each adapter answers a structurally different question (root count vs. joined-row count would otherwise diverge), so duplication here is cheaper than a shared base that would need to explain why it's safe to share.

## Ideas / future plans

- A `CursorAdapter` implementation once its constructor shape (explicit keyset column(s)) is resolved.
