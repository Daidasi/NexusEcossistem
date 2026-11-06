import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../storage/db';
import { demand, Fault, SYSTEM, uuid, type User, type Connection, type Message, type MemoryRef } from './domain';
import { member, audit } from './access';
import { retrieve } from '../memory/service';
import { unseal, rateLimit } from '../identity/security';
import { officialAdapters, safeFailure, type Adapter } from '../bridge/providers';

export const sendInput=z.object({roomId:uuid,requestId:uuid,content:z.string().trim().min(1).max(4000),
 connectionIds:z.array(uuid).max(6).default([]),mode:z.enum(['selected','mentions','coordinated']).default('selected'),
 rounds:z.number().int().min(1).max(3).default(1)});
const MAX_OUTPUT=1024;
// Input is bounded by UTF-8 bytes, a conservative upper bound for supported byte tokenizers.
const MAX_INPUT=22000;
const TOKEN_RESERVATION=MAX_INPUT+MAX_OUTPUT;
interface Attached extends Connection {policy:'owner'|'members';payer:'owner'|'room'}
async function attached(db: Db,user: User,roomId:string,id:string) {
 await member(db,user,roomId);
 const [c]=await db.query<Attached>(`SELECT c.*,rc.policy,rc.payer FROM connections c JOIN room_connections rc ON rc.connection_id=c.id
 WHERE c.id=$1 AND rc.room_id=$2 AND rc.active=true AND c.available=true
 AND EXISTS(SELECT 1 FROM room_members m WHERE m.room_id=rc.room_id AND m.user_id=c.owner_id)
 AND (c.owner_id=$3 OR rc.policy='members')`,[id,roomId,user.id]);
 demand(c,'Conexão indisponível ou não autorizada.'); return c;
}
async function reserve(db:Db,user:User,runId:string,roomId:string,id:string) {
 return db.transaction(async tx=>{
  await tx.query('SELECT id FROM connections WHERE id=$1 FOR NO KEY UPDATE',[id]);
  await tx.query('SELECT connection_id FROM room_connections WHERE connection_id=$1 AND room_id=$2 FOR SHARE',[id,roomId]);
  const c=await attached(tx,user,roomId,id);
  const money=Math.ceil(MAX_INPUT*Number(c.input_rate)+MAX_OUTPUT*Number(c.output_rate));
  const [ok]=await tx.query(`UPDATE connections SET tokens_reserved=tokens_reserved+$1,reserved_micro=reserved_micro+$2
   WHERE id=$3 AND tokens_spent+tokens_reserved+$1<=token_budget AND spent_micro+reserved_micro+$2<=budget_micro RETURNING id`,[TOKEN_RESERVATION,money,id]);
  demand(ok,'Orçamento desta conexão insuficiente.',402);
  if(c.payer==='room') {
   const [room]=await tx.query('UPDATE rooms SET reserved_micro=reserved_micro+$1 WHERE id=$2 AND spent_micro+reserved_micro+$1<=budget_micro RETURNING id',[money,roomId]);
   demand(room,'Orçamento compartilhado insuficiente.',402);
  }
  const usageId=randomUUID();
  await tx.query(`INSERT INTO usage(id,run_id,room_id,connection_id,actor_id,status,reserved_tokens,reserved_micro,payer)
   VALUES($1,$2,$3,$4,$5,'reserved',$6,$7,$8)`,[usageId,runId,roomId,id,user.id,TOKEN_RESERVATION,money,c.payer]);
  return {usageId,money,payer:c.payer,configuration:c};
 });
}
async function settle(db:Db,id:string,roomId:string,res:{usageId:string;money:number;payer:string},status:string,input:number,output:number,cost:number) {
 const [entry]=await db.query<{status:string}>('SELECT status FROM usage WHERE id=$1 FOR UPDATE',[res.usageId]);
 if(!entry || entry.status!=='reserved')return;
 const tokens=status==='succeeded'?input+output:status==='not_dispatched'?0:TOKEN_RESERVATION;
 const charged=status==='succeeded'?cost:status==='not_dispatched'?0:res.money;
 await db.query('UPDATE connections SET tokens_reserved=tokens_reserved-$1,reserved_micro=reserved_micro-$2,tokens_spent=tokens_spent+$3,spent_micro=spent_micro+$4,status=$5 WHERE id=$6',
 [TOKEN_RESERVATION,res.money,tokens,charged,status==='succeeded'?'ready':'error',id]);
 if(res.payer==='room') await db.query('UPDATE rooms SET reserved_micro=reserved_micro-$1,spent_micro=spent_micro+$2 WHERE id=$3',[res.money,charged,roomId]);
 await db.query('UPDATE usage SET status=$1,input_tokens=$2,output_tokens=$3,cost_micro=$4 WHERE id=$5',[status,input,output,charged,res.usageId]);
}
async function prepareContext(db:Db,user:User,roomId:string,id:string,prompt:string) {
 const memories=await retrieve(db,user,roomId,id,prompt,6000);
 const allowed=await db.query<{id:string;version:number}>(`SELECT m.id,m.version FROM memories m JOIN memory_grants g ON g.memory_id=m.id
  WHERE g.connection_id=$1 AND (m.room_id=$2 OR m.project_id=(SELECT project_id FROM rooms WHERE id=$2))`,[id,roomId]);
 const versions=new Map(allowed.map(m=>[m.id,m.version]));
 const previous=await db.query<Message>(`SELECT * FROM messages WHERE room_id=$1 AND role<>'error' ORDER BY created_at DESC,id DESC LIMIT 20`,[roomId]);
 const refs=new Map<string,MemoryRef>(memories.map(m=>[m.id,{id:m.id,title:m.title,version:m.version}]));
 const history:{author:string;role:string;text:string}[]=[];let remaining=6000;
 for(const m of previous) {
  if(!m.memory_refs.every(ref=>versions.get(ref.id)===ref.version))continue;
  const entry={author:m.author_name,role:m.role,text:m.content};const bytes=Buffer.byteLength(JSON.stringify(entry));
  if(bytes>remaining)continue;remaining-=bytes;history.unshift(entry);
  for(const ref of m.memory_refs)refs.set(ref.id,ref);
 }
 const input=JSON.stringify({purpose:'Responder ao pedido nesta sala',untrusted_memories:memories.map(m=>({id:m.id,version:m.version,text:m.content})),untrusted_history:history,user_request:prompt});
 demand(Buffer.byteLength(input)+Buffer.byteLength(SYSTEM)+1024<=MAX_INPUT,'Contexto excede o limite.',400);
 return {input,refs:[...refs.values()]};
}
async function callOne(db:Db,user:User,runId:string,roomId:string,id:string,prompt:string,adapter:Adapter) {
 let res:Awaited<ReturnType<typeof reserve>>|undefined;
 let display='Conexão';let prov:string|null=null;let model:string|null=null;let owner=user.id;
 let dispatched=false;let refs:MemoryRef[]=[];
 try {
  const selected=await attached(db,user,roomId,id);display=selected.name;prov=selected.provider;model=selected.model;owner=selected.owner_id;
  res=await reserve(db,user,runId,roomId,id);
  const plan=await prepareContext(db,user,roomId,id,prompt);refs=plan.refs;
  // Durable intent precedes network I/O. A crash leaves an auditable intent plus a reserved ledger row.
  await audit(db,user.id,'provider.dispatch_intent',id,roomId,{provider:prov,model,purpose:'room_reply',scope:'room',memoryRefs:refs,runId,usageId:res.usageId});
  await db.transaction(async tx=>{
   // NO KEY UPDATE permits FK KEY SHARE locks while retaining exclusive configuration updates.
   await tx.query('SELECT id FROM connections WHERE id=$1 FOR NO KEY UPDATE',[id]);
   await tx.query('SELECT connection_id FROM room_connections WHERE connection_id=$1 AND room_id=$2 FOR SHARE',[id,roomId]);
   await tx.query('SELECT user_id FROM room_members WHERE room_id=$1 AND user_id IN ($2,$3) ORDER BY user_id FOR SHARE',[roomId,user.id,owner]);
   const c=await attached(tx,user,roomId,id),saved=res!.configuration;
   demand(c.model===saved.model && c.secret===saved.secret && c.input_rate===saved.input_rate && c.output_rate===saved.output_rate && c.payer===saved.payer && c.policy===saved.policy,'Configuração alterada. Envie novamente.',409);
   for(const ref of [...refs].sort((a,b)=>a.id.localeCompare(b.id))) {
    const [m]=await tx.query<{version:number}>(`SELECT m.version FROM memories m JOIN memory_grants g ON g.memory_id=m.id
     WHERE m.id=$1 AND g.connection_id=$2 AND (m.room_id=$3 OR m.project_id=(SELECT project_id FROM rooms WHERE id=$3)) FOR SHARE OF m`,[ref.id,id,roomId]);
    demand(m?.version===ref.version,'Memória alterada ou revogada antes do envio. Envie novamente.',409);
   }
   const apiKey=unseal(c.secret,c.owner_id,c.id);
   dispatched=true;
   const v=await adapter.complete({provider:c.provider,model:c.model,apiKey,system:SYSTEM,input:plan.input,maxOutput:MAX_OUTPUT});
   demand(v.text.trim(),'O provedor retornou uma resposta vazia.',502);
   const usageKnown=v.inputTokens>0 && v.outputTokens>0;
   const inputTokens=usageKnown?v.inputTokens:MAX_INPUT,outputTokens=usageKnown?v.outputTokens:MAX_OUTPUT;
   const cost=Math.ceil(inputTokens*Number(c.input_rate)+outputTokens*Number(c.output_rate));
   await tx.query(`INSERT INTO messages(id,room_id,run_id,author_id,connection_id,author_name,provider,model,role,content,memory_refs)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,'assistant',$9,$10)`,[randomUUID(),roomId,runId,c.owner_id,id,c.name,c.provider,c.model,v.text.slice(0,30000),JSON.stringify(refs)]);
   await settle(tx,id,roomId,res!,'succeeded',inputTokens,outputTokens,cost);
   await audit(tx,user.id,'provider.succeeded',id,roomId,{runId,usageId:res!.usageId,memoryRefs:refs});
  });
 }catch(error){
  const message=error instanceof Fault?error.message:safeFailure(error);
  await db.transaction(async tx=>{
   if(res)await settle(tx,id,roomId,res,dispatched?'failed_reserved':'not_dispatched',0,0,0);
   const [stillMember]=await tx.query('SELECT 1 FROM room_members WHERE room_id=$1 AND user_id=$2',[roomId,user.id]);
   if(stillMember)await tx.query(`INSERT INTO messages(id,room_id,run_id,author_id,connection_id,author_name,provider,model,role,content)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,'error',$9)`,[randomUUID(),roomId,runId,owner,id,display,prov,model,message]);
   await audit(tx,user.id,'provider.failed',id,roomId,{runId,category:message,provider:prov,model,purpose:'room_reply',memoryRefs:refs,dispatched,reservationRetained:dispatched});
  });
 }
}
export async function orchestrate(db:Db,user:User,input:unknown,adapter:Adapter=officialAdapters) {
 const v=sendInput.parse(input); await member(db,user,v.roomId);
 const existing=await db.query<{id:string;status:string}>('SELECT id,status FROM runs WHERE actor_id=$1 AND request_id=$2',[user.id,v.requestId]);
 if(existing.length) return {...existing[0],duplicate:true};
 await rateLimit(db,`send:${user.id}`,12);
 let ids=[...new Set(v.connectionIds)];
 if(v.mode==='mentions') {
  // Unambiguous handles: @[connection UUID]. Display names never determine ownership.
  ids=[...new Set([...v.content.matchAll(/@\[([0-9a-f-]{36})\]/gi)].map(m=>uuid.parse(m[1])))];
 }
 demand(ids.length<=6,'Máximo de seis conexões por envio.',400);
 for(const id of ids) await attached(db,user,v.roomId,id);
 const runId=randomUUID();
 const inserted=await db.transaction(async tx=>{
  const rows=await tx.query(`INSERT INTO runs(id,room_id,actor_id,request_id) VALUES($1,$2,$3,$4) ON CONFLICT(actor_id,request_id) DO NOTHING RETURNING id`,[runId,v.roomId,user.id,v.requestId]);
  if(!rows.length)return false;
  await tx.query(`INSERT INTO messages(id,room_id,run_id,author_id,author_name,role,content) VALUES($1,$2,$3,$4,$5,'user',$6)`,[randomUUID(),v.roomId,runId,user.id,user.name,v.content]);return true;
 });
 if(!inserted)return {duplicate:true};
 try {
  const rounds=v.mode==='coordinated'?v.rounds:1;
  for(let round=0;round<rounds;round++) {
   const results=await Promise.allSettled(ids.map(id=>callOne(db,user,runId,v.roomId,id,v.content,adapter)));
   if(results.some(r=>r.status==='rejected')) throw new Fault(500,'Falha ao registrar uma resposta. Consulte o histórico antes de reenviar.');
  }
  await db.query("UPDATE runs SET status='completed' WHERE id=$1",[runId]);
 } catch(e) { await db.query("UPDATE runs SET status='interrupted' WHERE id=$1",[runId]);throw e; }
 return {id:runId,status:'completed'};
}
