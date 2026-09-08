import { describe, it, expect } from 'vitest';
import { escapeLikeValue, likeEscapeClause } from '../../src/sqlHelper.js';

describe('escapeLikeValue', () => {
  it.each([
    ['leaves a value with no special characters unchanged', 'foo', undefined, 'foo'],
    ['escapes underscore with the default escape char', 'foo_bar', undefined, 'foo\\_bar'],
    ['escapes percent with the default escape char', 'foo%bar', undefined, 'foo\\%bar'],
    ['escapes an existing escape char before escaping underscore/percent', 'foo\\bar', undefined, 'foo\\\\bar'],
    ['does not double-escape when the escape char neutralization runs first', '50\\% off', undefined, '50\\\\\\% off'],
    ['accepts a custom escape char', 'foo_bar', '!', 'foo!_bar'],
    ['neutralizes an existing custom escape char first', 'foo!bar', '!', 'foo!!bar'],
  ] as const)('%s', (_name, value, escapeChar, expected) => {
    expect(escapeChar === undefined ? escapeLikeValue(value) : escapeLikeValue(value, escapeChar)).toBe(expected);
  });
});

describe('likeEscapeClause', () => {
  it.each([
    ['renders the default escape char', undefined, "ESCAPE '\\'"],
    ['accepts a custom escape char', '!', "ESCAPE '!'"],
    ['doubles a single quote in a custom escape char so the SQL literal stays valid', "'", "ESCAPE ''''"],
  ] as const)('%s', (_name, escapeChar, expected) => {
    expect(escapeChar === undefined ? likeEscapeClause() : likeEscapeClause(escapeChar)).toBe(expected);
  });
});
