import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import type { PGlite } from '@electric-sql/pglite';

export interface Db {
 query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
 transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
 close(): Promise<void>;
}
export async function schema() {
 return readFile(`${process.cwd()}/src/modules/storage/schema.sql`, 'utf8');
}
export async function embedded(path?: string): Promise<Db> {
 const { PGlite }=await import('@electric-sql/pglite');
 const pg = new PGlite(path);
 await pg.exec(await schema());
 const wrap = (client: Pick<PGlite, 'query'>): Db => ({
  query: async <T>(sql: string, params: unknown[] = []) => (await client.query<T>(sql, params)).rows,
  transaction: fn => pg.transaction(tx => fn(wrap(tx))),
  close: () => pg.close(),
 });
 return wrap(pg);
}
export function postgres(url: string): Db {
 const pool = new Pool({ connectionString: url, max: 12, connectionTimeoutMillis: 10000 });
 return {
  query: async <T>(sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows as T[],
  transaction: async fn => {
   const client = await pool.connect();
   try {
    await client.query('BEGIN');
    const tx: Db = { query: async <T>(s: string,p: unknown[]=[]) => (await client.query(s,p)).rows as T[],
     transaction: async () => { throw new Error('Nested transaction unsupported'); }, close: async () => {} };
    const result = await fn(tx); await client.query('COMMIT'); return result;
   } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  },
  close: () => pool.end(),
 };
}
const globalDb = globalThis as unknown as { nexusDb?: Promise<Db> };
export function database(): Promise<Db> {
 if (!globalDb.nexusDb) {
  if (process.env.DATABASE_URL) globalDb.nexusDb = Promise.resolve(postgres(process.env.DATABASE_URL));
  else if (process.env.NEXUS_LOCAL_DB === '1' && process.env.NODE_ENV !== 'production')
   globalDb.nexusDb = embedded(`${process.cwd()}/.data/nexus`);
  else throw new Error('DATABASE_URL is required');
 }
 return globalDb.nexusDb;
}
