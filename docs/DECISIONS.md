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

## `LIKE` escaping: the escape character is `~`, and markers are substituted before escaping

**Date:** 2026-09-28

**Decision:** The escape character is a module-private `LIKE_ESCAPE_CHAR = '~'`; neither `escapeLikeValue()` nor `likeEscapeClause()` takes an `escapeChar` argument. `toLikePattern()` splits the value on `SearchTermsConfig.likeMarkers` first, escapes each chunk, then joins with `%`. Supersedes the exported `DEFAULT_LIKE_ESCAPE_CHAR = '\\'` and the optional-argument signatures. Mirrors the same decision in `search-query-doctrine`.

**Why `~`:** a backslash has no spelling valid on every engine, and `likeEscapeClause()` emitted the one MySQL/MariaDB reject outright.

|               | MySQL 8.0         | MariaDB 11        | PostgreSQL 16 | SQLite   |
| :------------ | :---------------- | :---------------- | :------------ | :------- |
| `ESCAPE '\'`  | syntax error 1064 | syntax error 1064 | ok            | ok       |
| `ESCAPE '\\'` | ok                | ok                | rejected      | rejected |
| `ESCAPE '~'`  | ok                | ok                | ok            | ok       |

`NO_BACKSLASH_ESCAPES` additionally swaps which backslash spelling MySQL accepts, at session level, where the package cannot see it. Drizzle does know its dialect, but the condition is built from a column alone, before any dialect is involved — and one character that works everywhere needs no detection at all.

**Why split before escaping:** escaping first turned any marker that `escapeLikeValue()` also escapes — `%`, `_`, `~` — into a literal, so `likeMarkers: ['%']` produced a query that ran but could never match.

**Consequence:** `escapeLikeValue()` output changes from `\_`/`\%` to `~_`/`~%`, and a caller who uses it _without_ `likeEscapeClause()` silently stops escaping — `~` has no implicit meaning the way MySQL's and PostgreSQL's `\` had.

## `splitOnMarkers()` scans with a bounded `for…of`, not a regex or a hand-advanced cursor

**Date:** 2026-09-28

**Decision:** The scan iterates `value.split('').entries()` and skips consumed marker characters with a `skip` counter, compared as `skip !== 0`.

**Why not a hand-advanced cursor:** mutating its increment (`++` → `--`, `+=` → `-=`) turns the loop endless, which Stryker records as a timeout — detected, but at the cost of a runaway process per mutant. A fixed iteration count means a wrong `skip` can only produce a wrong split, which an assertion kills. See the matching `search-query-doctrine` entry, where this was measured.

**Why not a regex split:** it needs a hand-written regex-metacharacter escape (`RegExp.escape` is Node 24+, `engines` allows 22), and every character of that class is a regex mutant only a marker containing exactly that character could kill. It would also pick leftmost-first alternatives differently from the scan for overlapping non-prefix markers, diverging from the PHP package.

**Why UTF-16 units, not code points:** `startsWith(marker, offset)` takes a UTF-16 offset. Iterating code points would desynchronise the two for any astral character; a surrogate pair split across two loop iterations is rejoined in the same chunk, since no well-formed marker can start in the middle of one.

**Why `skip !== 0` and not `skip > 0`:** the counter is never negative, so the two are equivalent — but under `> 0` a mutated negative starting value behaves like `0`, which is an unkillable mutant.

**Careful:** the multi-character-marker scenarios are what keep the `skip` branch reachable; with single-character markers `skip` is always `0` and every mutation of it escapes.

## Negated terms match `NULL` by default

**Date:** 2026-09-28

**Decision:** When `SearchTermsConfig.ignoredTermsMatchNull` is `true` (the default from `@pimbay/search-query` 2.1), each negated predicate is wrapped as `or(predicate, isNull(column))`.

**Why:** `column <> 'red'` evaluates to NULL, not TRUE, for a row with no value, and `WHERE` keeps only TRUE — so a bare negation drops every such row, which is not what `-red` means to the person typing it. Positive terms are untouched: a NULL row never equals or is like anything anyway.
