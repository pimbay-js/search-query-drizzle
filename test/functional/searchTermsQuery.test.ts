import { describe, it, expect, beforeEach } from 'vitest';
import { createSearchTermsConfig } from '@pimbay/search-query';
import type { SearchTermsConfig } from '@pimbay/search-query';
import { buildSearchTermsCondition } from '../../src/searchTermsQuery.js';
import { createDb, product, seedProducts } from './fixture.js';
import type { Db } from './fixture.js';

const anchoredConfig = createSearchTermsConfig({ anywhere: false });

/** Proves `%`/`_` escaping actually works on SQLite (no implicit default escape char, unlike Postgres/MySQL). */
describe('buildSearchTermsCondition (functional, real SQLite)', () => {
  let db: Db;

  function filteredNames(terms: readonly string[], config: SearchTermsConfig = createSearchTermsConfig()): string[] {
    const condition = buildSearchTermsCondition(product.name, terms, config);
    const rows = db.select({ name: product.name }).from(product).where(condition).orderBy(product.id).all();

    return rows.map((row) => row.name);
  }

  describe('filter scenarios', () => {
    beforeEach(() => {
      db = createDb();
      seedProducts(db, [
        { name: 'red shirt', price: 10 },
        { name: 'blue shirt', price: 20 },
        { name: 'red hat', price: 30 },
        { name: 'green hat', price: 40 },
        { name: 'red', price: 50 },
        { name: 'bright red', price: 60 },
      ]);
    });

    it.each<[string, string[], SearchTermsConfig | undefined, string[]]>([
      ['equals matches the exact value only', ['red shirt'], undefined, ['red shirt']],
      ['equals with multiple values is OR-combined', ['red shirt', 'green hat'], undefined, ['red shirt', 'green hat']],
      [
        // 'red*' with no leading marker + anywhere: false → prefix match only. "bright red" doesn't start with "red".
        'anywhere false requires the term to be a prefix, matching only what the marker itself covers',
        ['red*'],
        anchoredConfig,
        ['red shirt', 'red hat', 'red'],
      ],
      [
        // Same 'red*' term as above, default anywhere: true this time → also matches "bright red".
        'anywhere true adds an extra leading wildcard, turning the same trailing-marker term into a contains match',
        ['red*'],
        undefined,
        ['red shirt', 'red hat', 'red', 'bright red'],
      ],
      [
        'a contains-style term (marker on both sides) matches a substring anywhere regardless of anywhere',
        ['*red*'],
        anchoredConfig,
        ['red shirt', 'red hat', 'red', 'bright red'],
      ],
      [
        'a negated term excludes the exact value only',
        ['-red'],
        undefined,
        ['red shirt', 'blue shirt', 'red hat', 'green hat', 'bright red'],
      ],
      [
        'a negated wildcard term excludes any row matching the pattern',
        ['-*hat*'],
        undefined,
        ['red shirt', 'blue shirt', 'red', 'bright red'],
      ],
      [
        // ends in "shirt" or "hat" AND does not contain "green".
        'combined positive and negative groups are both applied',
        ['*shirt', '*hat', '-*green*'],
        undefined,
        ['red shirt', 'blue shirt', 'red hat'],
      ],
    ])('%s', (_name, terms, config, expectedNames) => {
      expect(filteredNames(terms, config)).toEqual(expectedNames);
    });

    it('no terms surviving minLength returns every row unfiltered via an undefined condition', () => {
      const rows = db.select({ name: product.name }).from(product).orderBy(product.id).all();

      expect(rows.map((row) => row.name)).toEqual([
        'red shirt',
        'blue shirt',
        'red hat',
        'green hat',
        'red',
        'bright red',
      ]);
    });
  });

  it('literal percent and underscore are escaped, not interpreted as wildcards, on SQLite', () => {
    db = createDb();
    seedProducts(db, [
      { name: 'a_b', price: 10 },
      { name: 'axb', price: 20 },
      { name: '50%off', price: 30 },
      { name: '50-anything-off', price: 40 },
    ]);

    const names = filteredNames(['a_b', '50%off'], anchoredConfig);

    expect(names).toEqual(['a_b', '50%off']);
  });
});
