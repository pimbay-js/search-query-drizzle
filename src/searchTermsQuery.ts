/**
 * This file is part of the PimBay Search Query library.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
import { and, eq, isNull, ne, or, sql } from 'drizzle-orm';
import type { AnyColumn, SQL } from 'drizzle-orm';
import type { ParsedSearchTerms, SearchTermsConfig } from '@pimbay/search-query';
import { parseSearchTerms, parseSearchTermsString } from '@pimbay/search-query';
import { escapeLikeValue, likeEscapeClause } from './sqlHelper.js';

/**
 * Equals/likes are OR-grouped, negated equals/likes are AND-grouped, the two groups are ANDed.
 * Returns `undefined` when no terms survive `minLength` — composes directly with
 * `.where(and(existingCondition, buildSearchTermsCondition(...)))`.
 */
export function buildSearchTermsCondition(
  column: AnyColumn,
  terms: readonly string[],
  config: SearchTermsConfig,
): SQL | undefined {
  return conditionFromParsed(column, parseSearchTerms(terms, config), config);
}

/** Parses and builds the condition in one step. */
export function buildSearchTermsConditionFromString(
  column: AnyColumn,
  text: string,
  config: SearchTermsConfig,
): SQL | undefined {
  return conditionFromParsed(column, parseSearchTermsString(text, config), config);
}

/** `and()`/`or()` already filter `undefined` and collapse to `undefined` on empty input, so no manual guarding is needed. */
function conditionFromParsed(column: AnyColumn, parsed: ParsedSearchTerms, config: SearchTermsConfig): SQL | undefined {
  const positive = [
    ...parsed.equals.map((value) => eq(column, value)),
    ...parsed.likes.map((value) => likeCondition(column, toLikePattern(value, config))),
  ];
  const negative = [
    ...parsed.notEquals.map((value) => negation(column, ne(column, value), config)),
    ...parsed.notLikes.map((value) => negation(column, notLikeCondition(column, toLikePattern(value, config)), config)),
  ];

  return and(or(...positive), and(...negative));
}

/** Via `sql` tag, not `like()`/`notLike()` — those don't support an `ESCAPE` clause. */
function likeCondition(column: AnyColumn, pattern: string): SQL {
  return sql`${column} LIKE ${pattern} ${sql.raw(likeEscapeClause())}`;
}

function notLikeCondition(column: AnyColumn, pattern: string): SQL {
  return sql`${column} NOT LIKE ${pattern} ${sql.raw(likeEscapeClause())}`;
}

/**
 * `value <> 'red'` is NULL, not TRUE, for a row with no value, and WHERE keeps only TRUE — so a bare negation drops
 * every such row, which is not what `-red` means.
 */
function negation(column: AnyColumn, predicate: SQL, config: SearchTermsConfig): SQL | undefined {
  return config.ignoredTermsMatchNull ? or(predicate, isNull(column)) : predicate;
}

// Prefix-only `%`, intentionally no trailing one. Escaping up front would neutralise any marker `escapeLikeValue`
// also escapes — `%`, `_` or the escape char itself — turning the caller's wildcard into a literal that never matches.
function toLikePattern(value: string, config: SearchTermsConfig): string {
  const escaped = splitOnMarkers(value, config.likeMarkers).map(escapeLikeValue).join('%');

  return config.anywhere ? `%${escaped}` : escaped;
}

/**
 * Neither a regex split nor a hand-advanced cursor, for reasons that outlive this function — read docs/DECISIONS.md
 * before changing the loop or the `!== 0` comparison below.
 */
function splitOnMarkers(value: string, markers: readonly string[]): string[] {
  const chunks: string[] = [];
  let chunk = '';
  let skip = 0;

  for (const [offset, character] of value.split('').entries()) {
    // `> 0` would be equivalent — the counter is never negative — but it makes a wrong starting value unobservable.
    if (skip !== 0) {
      skip--;

      continue;
    }

    // Markers arrive longest-first from `createSearchTermsConfig`, so a marker that prefixes another never shadows it.
    const marker = markers.find((candidate) => value.startsWith(candidate, offset));

    if (marker === undefined) {
      chunk += character;

      continue;
    }

    chunks.push(chunk);
    chunk = '';
    skip = marker.length - 1;
  }

  chunks.push(chunk);

  return chunks;
}
