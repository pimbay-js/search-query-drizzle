/**
 * This file is part of the PimBay Search Query library.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */

/**
 * Deliberately not a backslash and deliberately not configurable: a backslash has no spelling that is valid on
 * MySQL/MariaDB and on PostgreSQL/SQLite at once. See docs/DECISIONS.md.
 */
const LIKE_ESCAPE_CHAR = '~';

/**
 * Escapes `%`/`_` for a LIKE pattern; the escape char itself must be neutralized first or one already present in
 * the value would double-escape wrong.
 */
export function escapeLikeValue(value: string): string {
  const withEscapedEscapeChar = value.replaceAll(LIKE_ESCAPE_CHAR, LIKE_ESCAPE_CHAR + LIKE_ESCAPE_CHAR);

  return withEscapedEscapeChar.replaceAll('_', `${LIKE_ESCAPE_CHAR}_`).replaceAll('%', `${LIKE_ESCAPE_CHAR}%`);
}

/**
 * Always emitted, on every engine: SQLite, SQL Server and Oracle define no implicit escape char at all, and
 * MySQL/MariaDB's implicit one is the backslash this package does not use.
 */
export function likeEscapeClause(): string {
  return `ESCAPE '${LIKE_ESCAPE_CHAR}'`;
}

/** The three below return a pattern for `LIKE`; pair each with `likeEscapeClause()`. */
export function containsPattern(value: string): string {
  return `%${escapeLikeValue(value)}%`;
}

export function startsWithPattern(value: string): string {
  return `${escapeLikeValue(value)}%`;
}

export function endsWithPattern(value: string): string {
  return `%${escapeLikeValue(value)}`;
}
