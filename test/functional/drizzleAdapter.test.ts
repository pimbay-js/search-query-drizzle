import { describe, it, expect, beforeEach } from 'vitest';
import { count, eq, inArray, like } from 'drizzle-orm';
import { DrizzleFetchJoinSafeAdapter, DrizzleIdentityAdapter, DrizzleSimpleAdapter } from '../../src/drizzleAdapter.js';
import { createDb, product, productTag, seedProducts, seedTaggedProducts } from './fixture.js';
import type { Db } from './fixture.js';

const TOTAL_ROWS = 23;

describe('DrizzleSimpleAdapter (functional, real SQLite)', () => {
  let db: Db;

  beforeEach(() => {
    db = createDb();
    seedProducts(
      db,
      Array.from({ length: TOTAL_ROWS }, (_, i) => ({
        name: `product-${String(i + 1).padStart(2, '0')}`,
        price: (i + 1) * 10,
      })),
    );
  });

  function adapter(): DrizzleSimpleAdapter<{ value: number }, { id: number; name: string; price: number }> {
    return new DrizzleSimpleAdapter(
      () => db.select({ value: count() }).from(product),
      (row) => row.value,
      () => db.select().from(product).orderBy(product.id).$dynamic(),
    );
  }

  it('walking every page without overlap or gaps reconstructs the full seeded set', async () => {
    const pageSize = 7;
    const seenNames: string[] = [];

    for (let offset = 0; offset < TOTAL_ROWS; offset += pageSize) {
      const chunk = await adapter().pageView(offset, pageSize);

      expect(chunk.totalCount).toBe(TOTAL_ROWS);

      for (const row of chunk.results) {
        seenNames.push(row.name);
      }
    }

    expect(seenNames).toHaveLength(TOTAL_ROWS);
    expect(new Set(seenNames).size).toBe(TOTAL_ROWS);
  });

  it('walking every page via pageSlice marks hasMore correctly on the last page', async () => {
    const pageSize = 10;

    const first = await adapter().pageSlice(0, pageSize);

    expect(first.results).toHaveLength(pageSize);
    expect(first.hasMore).toBe(true);

    const second = await adapter().pageSlice(pageSize, pageSize);

    expect(second.results).toHaveLength(pageSize);
    expect(second.hasMore).toBe(true);

    const third = await adapter().pageSlice(pageSize * 2, pageSize);

    expect(third.results).toHaveLength(TOTAL_ROWS - pageSize * 2);
    expect(third.hasMore).toBe(false);
  });

  it('a page size that divides a filtered set exactly still reports no more on the final page', async () => {
    // 23 rows is prime, so exercise the exact-fit boundary using a filter that narrows to a
    // set divisible by the page size instead (product-01..product-09 → 9 rows).
    const filtered = new DrizzleSimpleAdapter(
      () => db.select({ value: count() }).from(product).where(like(product.name, 'product-0%')),
      (row) => row.value,
      () => db.select().from(product).where(like(product.name, 'product-0%')).orderBy(product.id).$dynamic(),
    );

    expect(await filtered.count()).toBe(9);

    const chunk = await filtered.pageSlice(0, 9);

    expect(chunk.results).toHaveLength(9);
    expect(chunk.hasMore).toBe(false);
  });

  it("identity adapter's ids match the paged rows for the same filter", async () => {
    // product-10..product-19 → 10 matches ("product-1" doesn't match product-01).
    const identity = new DrizzleIdentityAdapter(
      () => db.select({ value: count() }).from(product).where(like(product.name, '%product-1%')),
      (row) => row.value,
      () => db.select().from(product).where(like(product.name, '%product-1%')).orderBy(product.id).$dynamic(),
      () =>
        db
          .select({ id: product.id })
          .from(product)
          .where(like(product.name, '%product-1%'))
          .orderBy(product.id)
          .$dynamic(),
      (row) => row.id,
    );

    const ids = await identity.ids();

    expect(ids).toHaveLength(10);

    const chunk = await identity.pageView(0, 20);

    expect(ids).toEqual(chunk.results.map((row) => row.id));
  });
});

interface ProductWithTags {
  readonly id: number;
  readonly name: string;
  readonly tags: readonly string[];
}

describe('DrizzleFetchJoinSafeAdapter (functional, real SQLite)', () => {
  let db: Db;

  beforeEach(() => {
    db = createDb();
    // Products "a"/"b" have tags; a naive LIMIT/OFFSET over the joined rows would double-count them.
    seedTaggedProducts(db, [
      { name: 'a', price: 10, tags: ['red', 'small', 'sale'] },
      { name: 'b', price: 20, tags: ['red', 'large'] },
      { name: 'c', price: 30, tags: [] },
    ]);
  });

  function adapter(): DrizzleFetchJoinSafeAdapter<{ value: number }, { id: number }, number, ProductWithTags> {
    return new DrizzleFetchJoinSafeAdapter(
      () => db.select({ value: count() }).from(product),
      (row) => row.value,
      () => db.select({ id: product.id }).from(product).orderBy(product.id).$dynamic(),
      (row) => row.id,
      async (ids) => {
        const rows = await db.query.product.findMany({
          where: inArray(product.id, [...ids]),
          with: { productTags: { with: { tag: true } } },
          orderBy: (fields, { asc }) => asc(fields.id),
        });

        return rows.map((row) => ({
          id: row.id,
          name: row.name,
          tags: row.productTags.map((pt) => pt.tag.name),
        }));
      },
    );
  }

  it('a raw join over this data actually does produce duplicate/multiplied root rows', async () => {
    // Proves the problem this adapter exists to solve is real for this fixture, not assumed.
    const joined = await db
      .select({ id: product.id })
      .from(product)
      .leftJoin(productTag, eq(productTag.productId, product.id));

    expect(joined).toHaveLength(6); // 3 tags for "a" + 2 for "b" + 1 null-joined row for "c" (no tags).
  });

  it('count returns the number of root products, not the number of joined rows', async () => {
    await expect(adapter().count()).resolves.toBe(3);
  });

  it('pageView returns fully hydrated rows without duplicate roots', async () => {
    const chunk = await adapter().pageView(0, 10);

    expect(chunk.totalCount).toBe(3);
    expect(chunk.results).toHaveLength(3);

    const byName = new Map(chunk.results.map((row) => [row.name, row.tags]));

    expect(byName.get('a')).toEqual(['red', 'small', 'sale']);
    expect(byName.get('b')).toEqual(['red', 'large']);
    expect(byName.get('c')).toEqual([]);
  });

  it('pageView paginates by root product, not by joined row', async () => {
    const first = await adapter().pageView(0, 2);

    expect(first.totalCount).toBe(3);
    expect(first.results.map((row) => row.name)).toEqual(['a', 'b']);

    const second = await adapter().pageView(2, 2);

    expect(second.totalCount).toBe(3);
    expect(second.results.map((row) => row.name)).toEqual(['c']);
  });
});
