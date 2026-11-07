import { postgres } from '../src/modules/storage/db';
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required');
const db=postgres(process.env.DATABASE_URL);
try {
 await db.transaction(async tx=>{
  await tx.query('DELETE FROM import_drafts WHERE expires_at<now()');
  await tx.query('DELETE FROM sessions WHERE expires_at<now()');
  await tx.query('DELETE FROM rate_limits WHERE expires_at<now()');
  await tx.query("UPDATE runs SET status='interrupted' WHERE status='running' AND created_at<now()-interval '15 minutes'");
 });
 console.log('Expurgo concluído. Reservas incertas preservadas para conciliação.');
}finally{await db.close();}
