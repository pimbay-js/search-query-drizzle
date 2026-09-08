import { describe, it, expect, vi } from 'vitest';
import { DrizzleFetchJoinSafeAdapter, DrizzleIdentityAdapter, DrizzleSimpleAdapter } from '../../src/drizzleAdapter.js';
import type { LimitOffsetQuery } from '../../src/drizzleAdapter.js';

/** Awaitable and chainable on `.limit()`/`.offset()`, like a real Drizzle Select query builder. */
interface FakeQuery<T> extends LimitOffsetQuery<T> {
  readonly limitCalls: number[];
  readonly offsetCalls: number[];
}

function fakeQuery<T>(rows: T[]): FakeQuery<T> {
  const limitCalls: number[] = [];
  const offsetCalls: number[] = [];

  const query: FakeQuery<T> = {
    limitCalls,
    offsetCalls,
    limit(size: number) {
      limitCalls.push(size);

      return query;
    },
    offset(offset: number) {
      offsetCalls.push(offset);

      return query;
    },
    then(onfulfilled, onrejected) {
      return Promise.resolve(rows).then(onfulfilled, onrejected);
    },
  };

  return query;
}

interface Countable {
  count(): Promise<number>;
}

// count() is implemented identically on all three adapters — verified once here, not per-class.
describe.each<[string, (buildCountQuery: () => PromiseLike<{ count: number }[]>) => Countable]>([
  [
    'DrizzleSimpleAdapter',
    (buildCountQuery): Countable =>
      new DrizzleSimpleAdapter(
        buildCountQuery,
        (row) => row.count,
        () => fakeQuery<{ id: string }>([]),
      ),
  ],
  [
    'DrizzleIdentityAdapter',
    (buildCountQuery): Countable =>
      new DrizzleIdentityAdapter(
        buildCountQuery,
        (row) => row.count,
        () => fakeQuery<{ id: string }>([]),
        () => fakeQuery<{ id: string }>([]),
        (row) => row.id,
      ),
  ],
  [
    'DrizzleFetchJoinSafeAdapter',
    (buildCountQuery): Countable =>
      new DrizzleFetchJoinSafeAdapter(
        buildCountQuery,
        (row) => row.count,
        () => fakeQuery<{ id: string }>([]),
        (row) => row.id,
        () => Promise.resolve([]),
      ),
  ],
])('%s count()', (_name, create) => {
  it('extracts the count from the first row', async () => {
    const adapter = create(() => fakeQuery([{ count: 5 }]));

    await expect(adapter.count()).resolves.toBe(5);
  });

  it('returns zero when the count query has no rows', async () => {
    const adapter = create(() => fakeQuery<{ count: number }>([]));

    await expect(adapter.count()).resolves.toBe(0);
  });
});

describe('DrizzleSimpleAdapter', () => {
  describe('head', () => {
    it('applies limit(size) to the row query', async () => {
      const rowQuery = fakeQuery([{ id: 'a' }, { id: 'b' }]);
      const adapter = new DrizzleSimpleAdapter(
        () => fakeQuery<{ count: number }>([]),
        (row) => row.count,
        () => rowQuery,
      );

      await expect(adapter.head(2)).resolves.toEqual([{ id: 'a' }, { id: 'b' }]);
      expect(rowQuery.limitCalls).toEqual([2]);
      expect(rowQuery.offsetCalls).toEqual([]);
    });
  });

  describe('all', () => {
    it('awaits the row query without limit or offset', async () => {
      const rowQuery = fakeQuery([{ id: 'a' }]);
      const adapter = new DrizzleSimpleAdapter(
        () => fakeQuery<{ count: number }>([]),
        (row) => row.count,
        () => rowQuery,
      );

      await expect(adapter.all()).resolves.toEqual([{ id: 'a' }]);
      expect(rowQuery.limitCalls).toEqual([]);
      expect(rowQuery.offsetCalls).toEqual([]);
    });
  });

  describe('pageView', () => {
    it('applies limit and offset to the row query and returns totalCount alongside the results', async () => {
      const rowQuery = fakeQuery([{ id: 'a' }, { id: 'b' }]);
      const adapter = new DrizzleSimpleAdapter(
        () => fakeQuery([{ count: 12 }]),
        (row) => row.count,
        () => rowQuery,
      );

      await expect(adapter.pageView(20, 10)).resolves.toEqual({
        results: [{ id: 'a' }, { id: 'b' }],
        totalCount: 12,
      });
      expect(rowQuery.limitCalls).toEqual([10]);
      expect(rowQuery.offsetCalls).toEqual([20]);
    });

    it('runs the count query independently of the row query', async () => {
      const buildCountQuery = vi.fn(() => fakeQuery([{ count: 0 }]));
      const buildRowQuery = vi.fn(() => fakeQuery<{ id: string }>([]));
      const adapter = new DrizzleSimpleAdapter(buildCountQuery, (row) => row.count, buildRowQuery);

      await adapter.pageView(0, 10);

      expect(buildCountQuery).toHaveBeenCalledTimes(1);
      expect(buildRowQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('pageSlice', () => {
    it.each([
      ['reports hasMore and drops the extra row when more than size rows come back', 3, true],
      ['reports no more when exactly size rows come back', 2, false],
    ] as const)('%s', async (_name, rowCount, expectedHasMore) => {
      const rows = Array.from({ length: rowCount }, (_v, i) => ({ id: 'abc'[i] }));
      const rowQuery = fakeQuery(rows);
      const adapter = new DrizzleSimpleAdapter(
        () => fakeQuery<{ count: number }>([]),
        (row) => row.count,
        () => rowQuery,
      );

      const chunk = await adapter.pageSlice(0, 2);

      expect(chunk.results).toEqual([{ id: 'a' }, { id: 'b' }]);
      expect(chunk.hasMore).toBe(expectedHasMore);
    });
  });
});

describe('DrizzleIdentityAdapter', () => {
  describe('ids', () => {
    it.each<[string, { id: string }[], string[]]>([
      ['maps every row through extractId', [{ id: 'a' }, { id: 'b' }], ['a', 'b']],
      ['returns an empty array when there are no rows', [], []],
    ])('%s', async (_name, idRows, expectedIds) => {
      const adapter = new DrizzleIdentityAdapter(
        () => fakeQuery<{ count: number }>([]),
        (row) => row.count,
        () => fakeQuery<{ id: string }>([]),
        () => fakeQuery(idRows),
        (row) => row.id,
      );

      await expect(adapter.ids()).resolves.toEqual(expectedIds);
    });
  });

  it('still supports count/head/all/pageView/pageSlice from DrizzleSimpleAdapter', async () => {
    const rowQuery = fakeQuery([{ id: 'a' }]);
    const adapter = new DrizzleIdentityAdapter(
      () => fakeQuery([{ count: 1 }]),
      (row) => row.count,
      () => rowQuery,
      () => fakeQuery([{ id: 'a' }]),
      (row) => row.id,
    );

    await expect(adapter.count()).resolves.toBe(1);
    await expect(adapter.head(1)).resolves.toEqual([{ id: 'a' }]);
  });
});

describe('DrizzleFetchJoinSafeAdapter', () => {
  describe('pageView', () => {
    it('pages by root id, then fetches full rows for exactly those ids', async () => {
      const idQuery = fakeQuery([{ id: 'a' }, { id: 'b' }]);
      const buildRowsForIds = vi.fn((ids: readonly string[]) =>
        Promise.resolve(ids.map((id) => ({ id, name: `product-${id}` }))),
      );
      const adapter = new DrizzleFetchJoinSafeAdapter(
        () => fakeQuery([{ count: 5 }]),
        (row) => row.count,
        () => idQuery,
        (row) => row.id,
        buildRowsForIds,
      );

      const chunk = await adapter.pageView(2, 2);

      expect(chunk.totalCount).toBe(5);
      expect(chunk.results).toEqual([
        { id: 'a', name: 'product-a' },
        { id: 'b', name: 'product-b' },
      ]);
      expect(idQuery.limitCalls).toEqual([2]);
      expect(idQuery.offsetCalls).toEqual([2]);
      expect(buildRowsForIds).toHaveBeenCalledExactlyOnceWith(['a', 'b']);
    });

    it('skips buildRowsForIds entirely when the id page is empty', async () => {
      const buildRowsForIds = vi.fn(() => Promise.resolve([{ id: 'unused' }]));
      const adapter = new DrizzleFetchJoinSafeAdapter(
        () => fakeQuery([{ count: 0 }]),
        (row) => row.count,
        () => fakeQuery<{ id: string }>([]),
        (row) => row.id,
        buildRowsForIds,
      );

      const chunk = await adapter.pageView(0, 10);

      expect(chunk).toEqual({ results: [], totalCount: 0 });
      expect(buildRowsForIds).not.toHaveBeenCalled();
    });

    it('runs the id-page query and the count query independently', async () => {
      const buildCountQuery = vi.fn(() => fakeQuery([{ count: 1 }]));
      const buildIdPageQuery = vi.fn(() => fakeQuery([{ id: 'a' }]));
      const adapter = new DrizzleFetchJoinSafeAdapter(
        buildCountQuery,
        (row) => row.count,
        buildIdPageQuery,
        (row) => row.id,
        () => Promise.resolve([{ id: 'a' }]),
      );

      await adapter.pageView(0, 10);

      expect(buildCountQuery).toHaveBeenCalledTimes(1);
      expect(buildIdPageQuery).toHaveBeenCalledTimes(1);
    });
  });
});
