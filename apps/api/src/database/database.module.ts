import { Global, Inject, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';
import * as schema from './schema.js';

export type DB = MySql2Database<typeof schema>;
/** A transaction handle has the same query API as DB. */
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
export type DbOrTx = DB | Tx;

export const DB_TOKEN = Symbol('DB');
export const InjectDb = () => Inject(DB_TOKEN);
const POOL_TOKEN = Symbol('MYSQL_POOL');

@Injectable()
class PoolCloser implements OnApplicationShutdown {
  constructor(@Inject(POOL_TOKEN) private readonly pool: mysql.Pool) {}
  async onApplicationShutdown() {
    await this.pool.end();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: POOL_TOKEN,
      useFactory: () => {
        const pool = mysql.createPool({ uri: env().DATABASE_URL, connectionLimit: 10, timezone: 'Z', dateStrings: false });
        // Make DB-side defaults (CURRENT_TIMESTAMP) UTC too, matching the dates the app writes.
        pool.pool.on('connection', (conn) => {
          conn.query("SET time_zone = '+00:00'");
        });
        return pool;
      },
    },
    {
      provide: DB_TOKEN,
      inject: [POOL_TOKEN],
      useFactory: (pool: mysql.Pool): DB => drizzle(pool, { schema, mode: 'default' }),
    },
    PoolCloser,
  ],
  exports: [DB_TOKEN],
})
export class DatabaseModule {}
