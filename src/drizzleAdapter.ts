/**
 * This file is part of the PimBay Search Query library.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
import type {
  AllAdapter,
  CountableAdapter,
  HeadableAdapter,
  IdentifiableAdapter,
  PageAdapter,
  PageChunk,
  SliceAdapter,
  SliceChunk,
} from '@pimbay/search-query';

/** Shape any Drizzle Select query builder (pg-core/mysql-core/sqlite-core) satisfies — chainable and thenable. */
export interface LimitOffsetQuery<TRow> extends PromiseLike<TRow[]> {
  limit(size: number): LimitOffsetQuery<TRow>;
  offset(offset: number): LimitOffsetQuery<TRow>;
}

/**
 * Default adapter for the common case: one FROM/JOIN/WHERE shape, count/rows differ only in SELECT projection.
 * `buildCountQuery`/`buildRowQuery` must each return a complete, already-filtered query — repeat the WHERE in both
 * if they both need it.
 *
 * No `ids()` here — use `DrizzleIdentityAdapter` when that's actually needed. Keeping it out avoids forcing an
 * extra id-only query builder on every call site that never calls `ids()`.
 */
export class DrizzleSimpleAdapter<TCountRow, TRow>
  implements PageAdapter<TRow>, SliceAdapter<TRow>, CountableAdapter, HeadableAdapter<TRow>, AllAdapter<TRow>
{
  constructor(
    protected readonly buildCountQuery: () => PromiseLike<TCountRow[]>,
    protected readonly extractCount: (row: TCountRow) => number,
    protected readonly buildRowQuery: () => LimitOffsetQuery<TRow>,
  ) {}

  async count(): Promise<number> {
    const rows = await this.buildCountQuery();
    const row = rows[0];

    return row !== undefined ? this.extractCount(row) : 0;
  }

  async head(size: number): Promise<TRow[]> {
    return await this.buildRowQuery().limit(size);
  }

  async all(): Promise<TRow[]> {
    return await this.buildRowQuery();
  }

  async pageView(offset: number, size: number): Promise<PageChunk<TRow>> {
    const [results, totalCount] = await Promise.all([this.buildRowQuery().limit(size).offset(offset), this.count()]);

    return { results, totalCount };
  }

  async pageSlice(offset: number, size: number): Promise<SliceChunk<TRow>> {
    const rows = await this.buildRowQuery()
      .limit(size + 1)
      .offset(offset);
    const hasMore = rows.length > size;

    return { results: hasMore ? rows.slice(0, size) : rows, hasMore };
  }
}

/** `DrizzleSimpleAdapter` plus `ids()`, backed by its own query — Drizzle can't cheaply reproject an existing query. */
export class DrizzleIdentityAdapter<TCountRow, TRow, TIdRow, Id extends number | string = string>
  extends DrizzleSimpleAdapter<TCountRow, TRow>
  implements IdentifiableAdapter<Id>
{
  constructor(
    buildCountQuery: () => PromiseLike<TCountRow[]>,
    extractCount: (row: TCountRow) => number,
    buildRowQuery: () => LimitOffsetQuery<TRow>,
    private readonly buildIdQuery: () => PromiseLike<TIdRow[]>,
    private readonly extractId: (row: TIdRow) => Id,
  ) {
    super(buildCountQuery, extractCount, buildRowQuery);
  }

  async ids(): Promise<Id[]> {
    const rows = await this.buildIdQuery();

    return rows.map((row) => this.extractId(row));
  }
}

/**
 * For pagination over a to-many join, where a plain `LIMIT`/`OFFSET` on the joined `SELECT` would miscount and
 * truncate (one row per joined child, not per root). Two-step split: `buildIdPageQuery` gets the distinct root
 * ids for the page, `buildRowsForIds` re-fetches the full row shape for exactly those ids.
 *
 * `PageAdapter`/`CountableAdapter` only. Row order isn't guaranteed to match `ids` — apply your
 * own `ORDER BY` in `buildRowsForIds` if order matters.
 */
export class DrizzleFetchJoinSafeAdapter<TCountRow, TIdRow, TId extends number | string, TRow>
  implements PageAdapter<TRow>, CountableAdapter
{
  constructor(
    private readonly buildCountQuery: () => PromiseLike<TCountRow[]>,
    private readonly extractCount: (row: TCountRow) => number,
    private readonly buildIdPageQuery: () => LimitOffsetQuery<TIdRow>,
    private readonly extractId: (row: TIdRow) => TId,
    private readonly buildRowsForIds: (ids: readonly TId[]) => PromiseLike<TRow[]>,
  ) {}

  async count(): Promise<number> {
    const rows = await this.buildCountQuery();
    const row = rows[0];

    return row !== undefined ? this.extractCount(row) : 0;
  }

  async pageView(offset: number, size: number): Promise<PageChunk<TRow>> {
    const [idRows, totalCount] = await Promise.all([this.buildIdPageQuery().limit(size).offset(offset), this.count()]);
    const ids = idRows.map((row) => this.extractId(row));
    const results = ids.length > 0 ? await this.buildRowsForIds(ids) : [];

    return { results, totalCount };
  }
}
