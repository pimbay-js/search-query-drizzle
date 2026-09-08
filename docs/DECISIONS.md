# Decisions

> Append-only log of decisions specific to _this_ project.
> Never edit or delete a past entry — if a decision changes, add a new entry that supersedes it and says so.
>
> **What belongs here** (test): would changing this silently break correctness, compatibility, or behavior if someone didn't know why it was done this way?
> If yes → here.
> If it's a cheap/local implementation detail → docs/context.md instead.
> If it's a pattern repeated across multiple repos → AGENTS.md instead, not here.

## `DrizzleFetchJoinSafeAdapter` takes `buildRowsForIds`, not a single query builder

**Date:** 2026-09-08

**Decision:** For pagination over a to-many join, the adapter splits into `buildIdPageQuery` (distinct root ids for the page) and `buildRowsForIds` (full row fetch for those ids), the latter supplied by the caller rather than derived automatically.

**Why:** Doctrine ORM's `OrmFetchJoinSafeAdapter` can lean on `Doctrine\ORM\Tools\Pagination\Paginator`, which re-hydrates fully joined entities from a distinct-root subquery internally. Drizzle has no entity hydration to lean on — there's no generic way to take an arbitrary joined `SELECT` and re-run it filtered to a specific id set. The caller already knows the right way to fetch those rows (typically via Drizzle's relational query API), so the adapter asks for that fetch directly instead of trying to reconstruct it.

**Consequence:** `PageAdapter`/`CountableAdapter` only — `Slice`/`Headable`/`All`/`Identifiable` would each need their own correctly-shaped id query, and `buildRowsForIds` doesn't promise ordering by `ids`, so composing them generically here isn't cheap or safe.
