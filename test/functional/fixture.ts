/**
 * Builds a real Drizzle database against an in-memory SQLite connection (`better-sqlite3`). Good
 * enough to exercise real SQL generation/execution, which is the point: none of the adapters or
 * `searchTermsQuery` should be verified against a hand-mocked query builder alone — see
 * `tests/Fixture/DbalFixture.php` in the sibling `search-query-doctrine` repo for the same
 * reasoning on the PHP side.
 */
import Database from 'better-sqlite3';
import { relations } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const product = sqliteTable('product', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  price: integer('price').notNull(),
});

export const tag = sqliteTable('tag', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
});

export const productTag = sqliteTable('product_tag', {
  productId: integer('product_id').notNull(),
  tagId: integer('tag_id').notNull(),
});

export const productRelations = relations(product, ({ many }) => ({
  productTags: many(productTag),
}));

export const productTagRelations = relations(productTag, ({ one }) => ({
  product: one(product, { fields: [productTag.productId], references: [product.id] }),
  tag: one(tag, { fields: [productTag.tagId], references: [tag.id] }),
}));

const schema = { product, tag, productTag, productRelations, productTagRelations };

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export function createDb(): Db {
  const sqlite = new Database(':memory:');

  sqlite.exec(`
        CREATE TABLE product (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, price INTEGER NOT NULL);
        CREATE TABLE tag (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
        CREATE TABLE product_tag (product_id INTEGER NOT NULL, tag_id INTEGER NOT NULL);
    `);

  return drizzle(sqlite, { schema });
}

interface ProductRow {
  readonly name: string;
  readonly price: number;
}

export function seedProducts(db: Db, rows: readonly ProductRow[]): void {
  for (const row of rows) {
    db.insert(product).values(row).run();
  }
}

interface TaggedProductRow {
  readonly name: string;
  readonly price: number;
  readonly tags?: readonly string[];
}

/** Seeds products with tags via the `product_tag` join table — for `DrizzleFetchJoinSafeAdapter`. */
export function seedTaggedProducts(db: Db, rows: readonly TaggedProductRow[]): void {
  const tagIdByName = new Map<string, number>();

  for (const row of rows) {
    const [inserted] = db
      .insert(product)
      .values({ name: row.name, price: row.price })
      .returning({ id: product.id })
      .all();

    if (inserted === undefined) {
      throw new Error('insert did not return the new product id');
    }

    for (const tagName of row.tags ?? []) {
      let tagId = tagIdByName.get(tagName);

      if (tagId === undefined) {
        const [insertedTag] = db.insert(tag).values({ name: tagName }).returning({ id: tag.id }).all();

        if (insertedTag === undefined) {
          throw new Error('insert did not return the new tag id');
        }

        tagId = insertedTag.id;
        tagIdByName.set(tagName, tagId);
      }

      db.insert(productTag).values({ productId: inserted.id, tagId }).run();
    }
  }
}
