import { describe, it, expect } from 'vitest';
import { PgDialect, pgTable, text } from 'drizzle-orm/pg-core';
import { buildSearchTermsCondition, buildSearchTermsConditionFromString } from '../../src/searchTermsQuery.js';
import { createSearchTermsConfig } from '@pimbay/search-query';
import type { SearchTermsConfig } from '@pimbay/search-query';

const table = pgTable('widget', { name: text('name') });
const dialect = new PgDialect();
const config = createSearchTermsConfig();
const anchoredConfig = createSearchTermsConfig({ anywhere: false });

function render(condition: ReturnType<typeof buildSearchTermsCondition>): { sql: string; params: unknown[] } {
  if (condition === undefined) {
    throw new Error('expected a defined SQL condition');
  }

  return dialect.sqlToQuery(condition);
}

describe('buildSearchTermsCondition', () => {
  it.each([
    ['returns undefined when no terms survive minLength', ['ab']],
    ['returns undefined for an empty terms list', []],
  ] as const)('%s', (_name, terms) => {
    expect(buildSearchTermsCondition(table.name, terms, config)).toBeUndefined();
  });

  it.each<[string, string[], SearchTermsConfig, string, unknown[]]>([
    ['builds an equality condition for a single plain term', ['foo'], config, '"widget"."name" = $1', ['foo']],
    [
      'ORs together multiple equals terms',
      ['foo', 'bar'],
      config,
      '("widget"."name" = $1 or "widget"."name" = $2)',
      ['foo', 'bar'],
    ],
    [
      'builds a prefixed LIKE condition for a wildcard term when anywhere is true',
      ['fo*o'],
      config,
      '"widget"."name" LIKE $1 ESCAPE \'~\'',
      ['%fo%o'],
    ],
    [
      'builds an unanchored LIKE condition when anywhere is false',
      ['fo*o'],
      anchoredConfig,
      '"widget"."name" LIKE $1 ESCAPE \'~\'',
      ['fo%o'],
    ],
    [
      'ANDs together negated terms instead of ORing them',
      ['-foo', '-bar'],
      config,
      '(("widget"."name" <> $1 or "widget"."name" is null) and ("widget"."name" <> $2 or "widget"."name" is null))',
      ['foo', 'bar'],
    ],
    [
      'builds a negated LIKE condition for a negated wildcard term',
      ['-fo*o'],
      config,
      '("widget"."name" NOT LIKE $1 ESCAPE \'~\' or "widget"."name" is null)',
      ['%fo%o'],
    ],
    [
      'ANDs the OR-grouped positives together with the AND-grouped negatives',
      ['foo', '-bar'],
      config,
      '("widget"."name" = $1 and ("widget"."name" <> $2 or "widget"."name" is null))',
      ['foo', 'bar'],
    ],
    [
      'escapes LIKE metacharacters present in the term value',
      ['50%_off*'],
      config,
      '"widget"."name" LIKE $1 ESCAPE \'~\'',
      ['%50~%~_off%'],
    ],
    [
      // The marker is `%`, which `escapeLikeValue` also escapes — escaping before substituting would turn the
      // caller's wildcard into a literal that can never match.
      'turns a marker that escapeLikeValue escapes into a wildcard all the same',
      ['100%done'],
      createSearchTermsConfig({ anywhere: false, likeMarkers: ['%'] }),
      '"widget"."name" LIKE $1 ESCAPE \'~\'',
      ['100%done'],
    ],
    [
      'maps several markers to the same wildcard',
      ['a*b?c'],
      createSearchTermsConfig({ anywhere: false, likeMarkers: ['*', '?'] }),
      '"widget"."name" LIKE $1 ESCAPE \'~\'',
      ['a%b%c'],
    ],
    [
      'maps a multi-character marker to one wildcard and keeps the rest of the value',
      ['a**b'],
      createSearchTermsConfig({ anywhere: false, likeMarkers: ['**'] }),
      '"widget"."name" LIKE $1 ESCAPE \'~\'',
      ['a%b'],
    ],
    [
      // Markers arrive longest-first, which is the only reason taking the first hit at each offset is correct:
      // matching `*` first would split the `**` into two wildcards.
      'never lets a marker that prefixes another shadow the longer one',
      ['a**b*c'],
      createSearchTermsConfig({ anywhere: false, likeMarkers: ['*', '**'] }),
      '"widget"."name" LIKE $1 ESCAPE \'~\'',
      ['a%b%c'],
    ],
    [
      'restores the bare stricter negations when ignoredTermsMatchNull is false',
      ['-foo', '-*bar'],
      createSearchTermsConfig({ ignoredTermsMatchNull: false }),
      '("widget"."name" <> $1 and "widget"."name" NOT LIKE $2 ESCAPE \'~\')',
      ['foo', '%%bar'],
    ],
  ])('%s', (_name, terms, termsConfig, expectedSql, expectedParams) => {
    const { sql, params } = render(buildSearchTermsCondition(table.name, terms, termsConfig));

    expect(sql).toBe(expectedSql);
    expect(params).toEqual(expectedParams);
  });
});

describe('buildSearchTermsConditionFromString', () => {
  it('parses and builds the condition in one step', () => {
    const { sql, params } = render(buildSearchTermsConditionFromString(table.name, 'foo -bar', config));

    expect(sql).toBe('("widget"."name" = $1 and ("widget"."name" <> $2 or "widget"."name" is null))');
    expect(params).toEqual(['foo', 'bar']);
  });

  it('returns undefined for blank text', () => {
    expect(buildSearchTermsConditionFromString(table.name, '   ', config)).toBeUndefined();
  });
});
