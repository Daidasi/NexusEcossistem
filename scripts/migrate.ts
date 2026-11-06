import { postgres, schema } from '../src/modules/storage/db';
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
const db=postgres(process.env.DATABASE_URL);
try { await db.query(await schema()); console.log('Schema NexusBridge aplicado.'); } finally { await db.close(); }
