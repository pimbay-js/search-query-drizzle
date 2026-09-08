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
      '"widget"."name" LIKE $1 ESCAPE \'\\\'',
      ['%fo%o'],
    ],
    [
      'builds an unanchored LIKE condition when anywhere is false',
      ['fo*o'],
      anchoredConfig,
      '"widget"."name" LIKE $1 ESCAPE \'\\\'',
      ['fo%o'],
    ],
    [
      'ANDs together negated terms instead of ORing them',
      ['-foo', '-bar'],
      config,
      '("widget"."name" <> $1 and "widget"."name" <> $2)',
      ['foo', 'bar'],
    ],
    [
      'builds a negated LIKE condition for a negated wildcard term',
      ['-fo*o'],
      config,
      '"widget"."name" NOT LIKE $1 ESCAPE \'\\\'',
      ['%fo%o'],
    ],
    [
      'ANDs the OR-grouped positives together with the AND-grouped negatives',
      ['foo', '-bar'],
      config,
      '("widget"."name" = $1 and "widget"."name" <> $2)',
      ['foo', 'bar'],
    ],
    [
      'escapes LIKE metacharacters present in the term value',
      ['50%_off*'],
      config,
      '"widget"."name" LIKE $1 ESCAPE \'\\\'',
      ['%50\\%\\_off%'],
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

    expect(sql).toBe('("widget"."name" = $1 and "widget"."name" <> $2)');
    expect(params).toEqual(['foo', 'bar']);
  });

  it('returns undefined for blank text', () => {
    expect(buildSearchTermsConditionFromString(table.name, '   ', config)).toBeUndefined();
  });
});
