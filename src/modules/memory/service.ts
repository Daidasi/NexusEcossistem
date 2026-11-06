import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../storage/db';
import { demand, text, uuid, type Memory, type User } from '../core/domain';
import { member, projectMember, audit } from '../core/access';
import { hash } from '../identity/security';

export const memoryInput = z.object({title:text,content:z.string().trim().min(1).max(12000),
 scope:z.enum(['personal','room','project']).default('personal'),roomId:uuid.optional(),projectId:uuid.optional(),
 origin:z.enum(['nexus','derived']).default('nexus'),source:z.string().max(200).default('Criação na Nexus'),
 grants:z.array(uuid).max(12).default([]),confirmSharing:z.boolean().default(false)});
export async function visibleMemories(db: Db,user: User,roomId?: string): Promise<Memory[]> {
 if(roomId) await member(db,user,roomId);
 return db.query<Memory>(`SELECT m.*,COALESCE((SELECT jsonb_agg(g.connection_id) FROM memory_grants g WHERE g.memory_id=m.id),'[]') AS grants
 FROM memories m WHERE (m.owner_id=$1 OR (m.scope='room' AND EXISTS(SELECT 1 FROM room_members rm WHERE rm.room_id=m.room_id AND rm.user_id=$1))
 OR (m.scope='project' AND EXISTS(SELECT 1 FROM project_members pm WHERE pm.project_id=m.project_id AND pm.user_id=$1)))
 AND ($2::uuid IS NULL OR m.scope='personal' OR m.room_id=$2 OR m.project_id=(SELECT project_id FROM rooms WHERE id=$2)) ORDER BY m.updated_at DESC LIMIT 200`,[user.id,roomId??null]);
}
async function validateScope(db: Db,user: User,v: z.infer<typeof memoryInput>) {
 if(v.scope==='personal') { demand(v.grants.length===0,'Memórias privadas não são enviadas a agentes.'); return; }
 demand(v.confirmSharing,'Confirme o compartilhamento com os participantes.');
 if(v.scope==='room') { demand(v.roomId,'Selecione uma sala.'); await member(db,user,v.roomId); }
 else { demand(v.projectId,'Selecione um projeto.'); await projectMember(db,user,v.projectId); }
 for(const id of v.grants) {
  const [c]=await db.query(`SELECT 1 FROM room_connections rc JOIN rooms r ON r.id=rc.room_id
   JOIN room_members rm ON rm.room_id=r.id JOIN connections c ON c.id=rc.connection_id
   WHERE rc.connection_id=$1 AND rc.active=true AND rm.user_id=$2
   AND ((c.owner_id=$2) OR rc.policy='members') AND
   (($3='room' AND r.id=$4) OR ($3='project' AND r.project_id=$5))`,[id,user.id,v.scope,v.roomId??null,v.projectId??null]);
  demand(c,'Conexão não disponível neste escopo.');
 }
}
export async function saveMemory(db: Db,user: User,input: unknown, id?: string, imported?: {source:string;source_hash:string}, insideTransaction=false) {
 const v=memoryInput.parse(input);
 const write=async(tx:Db)=>{
  await validateScope(tx,user,v);
  const memoryId=id??randomUUID();
  if(id) {
   const [old]=await tx.query<Memory>('SELECT * FROM memories WHERE id=$1 AND owner_id=$2 FOR UPDATE',[id,user.id]); demand(old);
   // Scope is immutable. To change the audience, explicitly create a new memory.
   demand(old.scope===v.scope && old.room_id===(v.scope==='room'?v.roomId:null) && old.project_id===(v.scope==='project'?v.projectId:null),'O escopo não pode ser alterado. Crie uma nova memória.');
   await tx.query(`UPDATE memories SET title=$1,content=$2,version=version+1,updated_at=now(),
    origin=CASE WHEN content<>$2 THEN 'derived' ELSE origin END WHERE id=$3`,[v.title,v.content,id]);
   await tx.query('DELETE FROM memory_grants WHERE memory_id=$1',[id]);
  } else await tx.query(`INSERT INTO memories(id,owner_id,title,content,scope,room_id,project_id,origin,source,source_hash)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[memoryId,user.id,v.title,v.content,v.scope,v.scope==='room'?v.roomId:null,
   v.scope==='project'?v.projectId:null,imported?'imported':v.origin,imported?.source??v.source,imported?.source_hash??hash(v.content)]);
  await tx.query('INSERT INTO memory_versions(memory_id,version,content,origin,source_hash) SELECT id,version,content,origin,source_hash FROM memories WHERE id=$1',[memoryId]);
  for(const conn of new Set(v.grants)) await tx.query('INSERT INTO memory_grants(memory_id,connection_id) VALUES($1,$2)',[memoryId,conn]);
  await audit(tx,user.id,id?'memory.updated':'memory.created',memoryId,v.scope==='room'?v.roomId!:null,{scope:v.scope,grants:v.grants,origin:imported?'imported':v.origin});
  return {id:memoryId};
 };
 return insideTransaction?write(db):db.transaction(write);
}
export async function revokeMemory(db: Db,user: User,id: string,remove=false) {
 return db.transaction(async tx=>{
  const [m]=await tx.query<Memory>('SELECT * FROM memories WHERE id=$1 AND owner_id=$2 FOR UPDATE',[id,user.id]); demand(m);
  await tx.query('DELETE FROM memory_grants WHERE memory_id=$1',[id]);
  if(remove) await tx.query('DELETE FROM memories WHERE id=$1',[id]);
  else {await tx.query('UPDATE memories SET version=version+1,updated_at=now() WHERE id=$1',[id]);await tx.query('INSERT INTO memory_versions(memory_id,version,content,origin,source_hash) SELECT id,version,content,origin,source_hash FROM memories WHERE id=$1',[id]);}
  await audit(tx,user.id,remove?'memory.deleted':'memory.revoked',id,m.room_id,{previousVersion:m.version});
  return {ok:true};
 });
}
// Only text and explicitly supported JSON export shapes; never render imported HTML or execute links.
export function normalizeImport(filename: string,raw: string): string {
 demand(Buffer.byteLength(raw)<=256000,'Arquivo excede 256 KB.',413);
 demand(!raw.includes('\0'),'Arquivo contém dados binários.',400);
 if(filename.toLowerCase().endsWith('.txt') || filename.toLowerCase().endsWith('.md')) return raw.trim().slice(0,12000);
 demand(filename.toLowerCase().endsWith('.json'),'Use TXT, MD ou JSON.',400);
 let data: unknown; try { data=JSON.parse(raw); } catch { throw new Error('INVALID_IMPORT'); }
 const snippets: string[]=[];
 const add=(v:unknown)=> {if(typeof v==='string') snippets.push(v);};
 if(Array.isArray(data)) for(const item of data.slice(0,100)) {
  if(typeof item==='string') { add(item); continue; }
  if(!item || typeof item!=='object') continue;
  if('content' in item) add(item.content);
  // ChatGPT conversations.json export; traverse mapping messages, not arbitrary metadata.
  if('mapping' in item && item.mapping && typeof item.mapping==='object')
   for(const node of Object.values(item.mapping).slice(0,300)) {
    const n=node as {message?:{content?:{parts?:unknown[]}}};
    for(const part of n?.message?.content?.parts??[]) add(part);
   }
  if('chat_messages' in item && Array.isArray(item.chat_messages))
   for(const msg of item.chat_messages.slice(0,300)) add(msg?.text);
 } else if(data && typeof data==='object' && 'memories' in data && Array.isArray(data.memories))
  for(const item of data.memories.slice(0,100)) add(item?.content);
 demand(snippets.length>0,'Formato JSON não compatível. Exporte como texto ou lista de objetos com content.',400);
 return snippets.join('\n\n').slice(0,12000);
}
export async function previewImport(db: Db,user: User,filename: string,raw: string) {
 let content: string;
 try { content=normalizeImport(filename,raw); } catch(e) { if(e instanceof Error && e.message==='INVALID_IMPORT') demand(false,'JSON inválido.',400); throw e; }
 demand(content.trim(),'Arquivo vazio.',400); const id=randomUUID();
 await db.query(`INSERT INTO import_drafts(id,owner_id,content,source,source_hash,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '30 minutes')`,[id,user.id,content,filename,hash(raw)]);
 return {id,content,source:filename,sourceHash:hash(raw),notice:'Prévia limitada a 12.000 caracteres. Nada é compartilhado até a confirmação.'};
}
export async function retrieve(db: Db,user: User,roomId: string,connectionId: string,query: string,budget=6000) {
 const room=await member(db,user,roomId);
 const candidates=await db.query<Memory>(`SELECT m.* FROM memories m JOIN memory_grants g ON g.memory_id=m.id
 WHERE g.connection_id=$1 AND ((m.scope='room' AND m.room_id=$2) OR (m.scope='project' AND m.project_id=$3)) ORDER BY m.updated_at DESC LIMIT 200`,[connectionId,roomId,room.project_id]);
 const words=new Set(query.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu)??[]);
 const ranked=candidates.map(m=>({m,score:[...words].filter(w=>(m.title+' '+m.content).toLocaleLowerCase().includes(w)).length}))
 .filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
 let left=budget; const selected: Memory[]=[];
 for(const {m} of ranked) { const bytes=Buffer.byteLength(m.content)+Buffer.byteLength(m.title)+200; if(bytes<=left) {selected.push(m);left-=bytes;} }
 return selected;
}
