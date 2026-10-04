/**
 * MySQL-family twin of `fixture.ts`, for the SQL that SQLite accepts but MariaDB rejects — `ESCAPE '\'` reached a
 * release that way. Runs only when SEARCH_QUERY_MYSQL_URL is set; docker-compose and CI point it at MariaDB 11.
 */
import { drizzle } from 'drizzle-orm/mysql2';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { int, mysqlTable, varchar } from 'drizzle-orm/mysql-core';
import { createConnection } from 'mysql2/promise';
import type { Connection } from 'mysql2/promise';

/** Server URL without a database — each test file creates its own, so vitest's parallel files never share tables. */
export const MYSQL_URL_ENV = 'SEARCH_QUERY_MYSQL_URL';

const rawMysqlUrl = process.env[MYSQL_URL_ENV];

export const mysqlUrl: string | undefined = rawMysqlUrl === '' ? undefined : rawMysqlUrl;

export const mysqlProduct = mysqlTable('product', {
  id: int('id').primaryKey().autoincrement(),
  name: varchar('name', { length: 255 }).notNull(),
  price: int('price').notNull(),
});

export const mysqlWidget = mysqlTable('widget', {
  id: int('id').primaryKey().autoincrement(),
  label: varchar('label', { length: 255 }),
});

export type MysqlDb = MySql2Database;

export interface MysqlDatabase {
  readonly db: MysqlDb;
  /**
   * Drops and recreates every table — a real server keeps them between tests, unlike in-memory SQLite, and a
   * `DELETE` would keep the `AUTO_INCREMENT` counter that the scenarios assert ids against.
   */
  readonly reset: () => Promise<void>;
  /** Drops the database and closes the connection. */
  readonly close: () => Promise<void>;
}

export async function createMysqlDatabase(url: string, name: string): Promise<MysqlDatabase> {
  const database = `search_query_${name}`;
  const connection: Connection = await createConnection({ uri: url, multipleStatements: true });

  await connection.query(
    `DROP DATABASE IF EXISTS \`${database}\`; CREATE DATABASE \`${database}\`; USE \`${database}\``,
  );

  const mysqlDatabase: MysqlDatabase = {
    db: drizzle(connection),
    reset: async () => {
      await connection.query(`
        DROP TABLE IF EXISTS product, widget;
        CREATE TABLE product (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL, price INT NOT NULL);
        CREATE TABLE widget (id INT AUTO_INCREMENT PRIMARY KEY, label VARCHAR(255) NULL);
      `);
    },
    close: async () => {
      await connection.query(`DROP DATABASE IF EXISTS \`${database}\``);
      await connection.end();
    },
  };

  return mysqlDatabase;
}
