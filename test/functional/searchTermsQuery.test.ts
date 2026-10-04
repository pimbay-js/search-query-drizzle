import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { createSearchTermsConfig } from '@pimbay/search-query';
import type { SearchTermsConfig } from '@pimbay/search-query';
import { buildSearchTermsCondition } from '../../src/searchTermsQuery.js';
import { containsPattern, endsWithPattern, likeEscapeClause, startsWithPattern } from '../../src/sqlHelper.js';
import { createDb, product, seedProducts, widget } from './fixture.js';
import type { Db } from './fixture.js';
import { createMysqlDatabase, MYSQL_URL_ENV, mysqlProduct, mysqlUrl, mysqlWidget } from './mysqlFixture.js';

const anchoredConfig = createSearchTermsConfig({ anywhere: false });

interface ProductRow {
  readonly name: string;
  readonly price: number;
}

/** Each engine has its own Drizzle table objects, so the condition is built inside, against that engine's column. */
interface Engine {
  reset(): Promise<void>;
  seedProducts(rows: readonly ProductRow[]): Promise<void>;
  seedWidgets(labels: readonly (string | null)[]): Promise<void>;
  productNames(terms: readonly string[], config: SearchTermsConfig): Promise<string[]>;
  widgetIds(terms: readonly string[], config: SearchTermsConfig): Promise<number[]>;
  productNamesLike(pattern: string): Promise<string[]>;
  close(): Promise<void>;
}

function sqliteEngine(): Engine {
  let db: Db = createDb();
  const engine: Engine = {
    reset: () => {
      db = createDb();

      return Promise.resolve();
    },
    seedProducts: (rows) => {
      seedProducts(db, rows);

      return Promise.resolve();
    },
    seedWidgets: (labels) => {
      for (const label of labels) {
        db.insert(widget).values({ label }).run();
      }

      return Promise.resolve();
    },
    productNames: async (terms, config) => {
      const condition = buildSearchTermsCondition(product.name, terms, config);
      const rows = await db.select({ name: product.name }).from(product).where(condition).orderBy(product.id);

      return rows.map((row) => row.name);
    },
    widgetIds: async (terms, config) => {
      const condition = buildSearchTermsCondition(widget.label, terms, config);
      const rows = await db.select({ id: widget.id }).from(widget).where(condition).orderBy(widget.id);

      return rows.map((row) => row.id);
    },
    productNamesLike: async (pattern) => {
      const rows = await db
        .select({ name: product.name })
        .from(product)
        .where(sql`${product.name} LIKE ${pattern} ${sql.raw(likeEscapeClause())}`)
        .orderBy(product.id);

      return rows.map((row) => row.name);
    },
    close: () => Promise.resolve(),
  };

  return engine;
}

async function mariadbEngine(): Promise<Engine> {
  if (mysqlUrl === undefined) {
    throw new Error(`${MYSQL_URL_ENV} is unset`);
  }

  const { db, reset, close } = await createMysqlDatabase(mysqlUrl, 'search_terms');
  const engine: Engine = {
    reset,
    seedProducts: async (rows) => {
      await db.insert(mysqlProduct).values([...rows]);
    },
    seedWidgets: async (labels) => {
      await db.insert(mysqlWidget).values(labels.map((label) => ({ label })));
    },
    productNames: async (terms, config) => {
      const condition = buildSearchTermsCondition(mysqlProduct.name, terms, config);
      const rows = await db
        .select({ name: mysqlProduct.name })
        .from(mysqlProduct)
        .where(condition)
        .orderBy(mysqlProduct.id);

      return rows.map((row) => row.name);
    },
    widgetIds: async (terms, config) => {
      const condition = buildSearchTermsCondition(mysqlWidget.label, terms, config);
      const rows = await db.select({ id: mysqlWidget.id }).from(mysqlWidget).where(condition).orderBy(mysqlWidget.id);

      return rows.map((row) => row.id);
    },
    productNamesLike: async (pattern) => {
      const rows = await db
        .select({ name: mysqlProduct.name })
        .from(mysqlProduct)
        .where(sql`${mysqlProduct.name} LIKE ${pattern} ${sql.raw(likeEscapeClause())}`)
        .orderBy(mysqlProduct.id);

      return rows.map((row) => row.name);
    },
    close,
  };

  return engine;
}

/** Same scenarios on every engine: SQLite alone accepted the `ESCAPE '\'` that MySQL/MariaDB reject. */
function defineScenarios(openEngine: () => Promise<Engine>): void {
  let engine: Engine;

  beforeAll(async () => {
    engine = await openEngine();
  });

  afterAll(async () => {
    await engine.close();
  });

  beforeEach(async () => {
    await engine.reset();
  });

  function filteredNames(
    terms: readonly string[],
    config: SearchTermsConfig = createSearchTermsConfig(),
  ): Promise<string[]> {
    return engine.productNames(terms, config);
  }

  describe('filter scenarios', () => {
    beforeEach(async () => {
      await engine.seedProducts([
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
      [
        'a multi-character marker is one wildcard',
        ['red**'],
        createSearchTermsConfig({ anywhere: false, likeMarkers: ['**'] }),
        ['red shirt', 'red hat', 'red'],
      ],
      [
        // Taken as two `*` wildcards the pattern would still match, so "the rest survives" is what is proved here.
        'a marker that prefixes another does not shadow the longer one',
        ['red**hat'],
        createSearchTermsConfig({ anywhere: false, likeMarkers: ['*', '**'] }),
        ['red hat'],
      ],
      [
        'a marker that the escaping also covers still acts as a wildcard',
        ['%hat'],
        createSearchTermsConfig({ anywhere: false, likeMarkers: ['%'] }),
        ['red hat', 'green hat'],
      ],
    ])('%s', async (_name, terms, config, expectedNames) => {
      expect(await filteredNames(terms, config)).toEqual(expectedNames);
    });

    it('no terms surviving minLength returns every row unfiltered via an undefined condition', async () => {
      expect(await filteredNames(['r'], createSearchTermsConfig({ minLength: 2 }))).toEqual([
        'red shirt',
        'blue shirt',
        'red hat',
        'green hat',
        'red',
        'bright red',
      ]);
    });
  });

  it('literal percent and underscore are escaped, not interpreted as wildcards', async () => {
    await engine.seedProducts([
      { name: 'a_b', price: 10 },
      { name: 'axb', price: 20 },
      { name: '50%off', price: 30 },
      { name: '50-anything-off', price: 40 },
    ]);

    expect(await filteredNames(['a_b', '50%off'], anchoredConfig)).toEqual(['a_b', '50%off']);
  });

  it('contains, starts-with and ends-with patterns match the value literally, wildcards included', async () => {
    await engine.seedProducts([
      { name: '50%off', price: 10 },
      { name: 'big 50%off', price: 20 },
      { name: '50%off today', price: 30 },
      { name: '50xoff', price: 40 },
      { name: 'a_b', price: 50 },
      { name: 'axb', price: 60 },
    ]);

    expect(await engine.productNamesLike(containsPattern('50%off'))).toEqual(['50%off', 'big 50%off', '50%off today']);
    expect(await engine.productNamesLike(startsWithPattern('50%off'))).toEqual(['50%off', '50%off today']);
    expect(await engine.productNamesLike(endsWithPattern('50%off'))).toEqual(['50%off', 'big 50%off']);
    expect(await engine.productNamesLike(containsPattern('a_b'))).toEqual(['a_b']);
  });

  it('negated terms keep rows with no value unless the stricter reading is asked for', async () => {
    await engine.seedWidgets(['red', 'blue', null]);

    // `-red` reads as "not red", and row 3 has nothing that is red.
    expect(await engine.widgetIds(['-red', '-*ee*'], createSearchTermsConfig())).toEqual([2, 3]);
    expect(
      await engine.widgetIds(['-red', '-*ee*'], createSearchTermsConfig({ ignoredTermsMatchNull: false })),
    ).toEqual([2]);
  });
}

describe('buildSearchTermsCondition (functional, real SQLite)', () => {
  defineScenarios(() => Promise.resolve(sqliteEngine()));
});

describe.skipIf(mysqlUrl === undefined)('buildSearchTermsCondition (functional, real MariaDB)', () => {
  defineScenarios(mariadbEngine);
});
