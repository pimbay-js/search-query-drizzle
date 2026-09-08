/**
 * This file is part of the PimBay Search Query library.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
import { and, eq, ne, or, sql } from 'drizzle-orm';
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
    ...parsed.notEquals.map((value) => ne(column, value)),
    ...parsed.notLikes.map((value) => notLikeCondition(column, toLikePattern(value, config))),
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

// Prefix-only `%`, intentionally no trailing one.
function toLikePattern(value: string, config: SearchTermsConfig): string {
  const escaped = escapeLikeValue(value).replaceAll(config.likeChar, '%');

  return config.anywhere ? `%${escaped}` : escaped;
}
