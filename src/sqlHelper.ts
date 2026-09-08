/**
 * This file is part of the PimBay Search Query library.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */

/** Postgres/MySQL/MariaDB default `LIKE` to this escape char implicitly; others need {@link likeEscapeClause} explicitly. */
export const DEFAULT_LIKE_ESCAPE_CHAR = '\\';

/**
 * Escapes `%`/`_` for a LIKE pattern; the escape char itself must be neutralized first or an
 * existing `\` would double-escape wrong.
 */
export function escapeLikeValue(value: string, escapeChar = DEFAULT_LIKE_ESCAPE_CHAR): string {
  const withEscapedEscapeChar = value.replaceAll(escapeChar, escapeChar + escapeChar);

  return withEscapedEscapeChar.replaceAll('_', `${escapeChar}_`).replaceAll('%', `${escapeChar}%`);
}

/** Renders the `ESCAPE` clause to append to a raw `LIKE`/`NOT LIKE` fragment. */
export function likeEscapeClause(escapeChar = DEFAULT_LIKE_ESCAPE_CHAR): string {
  return `ESCAPE '${escapeChar.replaceAll("'", "''")}'`;
}
