import { describe, it, expect } from 'vitest';
import {
  containsPattern,
  endsWithPattern,
  escapeLikeValue,
  likeEscapeClause,
  startsWithPattern,
} from '../../src/sqlHelper.js';

describe('escapeLikeValue', () => {
  it.each([
    ['leaves a value with no special characters unchanged', 'foo', 'foo'],
    ['escapes underscore', 'foo_bar', 'foo~_bar'],
    ['escapes percent', 'foo%bar', 'foo~%bar'],
    ['escapes both', '100%_off', '100~%~_off'],
    ['neutralizes a literal escape char first', 'foo~bar', 'foo~~bar'],
    ['does not double-escape when the escape char neutralization runs first', 'a~_b', 'a~~~_b'],
    ['leaves a literal backslash alone', 'a\\b', 'a\\b'],
    ['leaves an empty string empty', '', ''],
  ] as const)('%s', (_name, value, expected) => {
    expect(escapeLikeValue(value)).toBe(expected);
  });
});

describe('containsPattern, startsWithPattern and endsWithPattern', () => {
  it.each([
    ['plain', 'hello', '%hello%', 'hello%', '%hello'],
    ['wildcards are escaped', '100%_off', '%100~%~_off%', '100~%~_off%', '%100~%~_off'],
    ['the escape char is escaped', 'a~b', '%a~~b%', 'a~~b%', '%a~~b'],
    ['empty string', '', '%%', '%', '%'],
  ] as const)('%s', (_name, value, contains, startsWith, endsWith) => {
    expect(containsPattern(value)).toBe(contains);
    expect(startsWithPattern(value)).toBe(startsWith);
    expect(endsWithPattern(value)).toBe(endsWith);
  });
});

describe('likeEscapeClause', () => {
  it('renders the escape char as a quoted SQL literal', () => {
    expect(likeEscapeClause()).toBe("ESCAPE '~'");
  });

  // A backslash would be an unterminated literal on MySQL/MariaDB, and the doubled form that fixes those two is
  // rejected by PostgreSQL and SQLite — the bug this escape char exists to avoid.
  it('carries nothing a string literal would itself escape', () => {
    expect(likeEscapeClause()).not.toContain('\\');
    expect(likeEscapeClause()).not.toContain("''");
  });
});
