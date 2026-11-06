import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../storage/db';
import { demand, Fault, uuid, text, provider, type User, type Connection } from './domain';
import { member, projectMember, audit } from './access';
import { hash, token, passwordHash, passwordMatches, rateLimit, seal, unseal } from '../identity/security';
import { memoryInput, saveMemory, visibleMemories, previewImport, revokeMemory } from '../memory/service';
import { officialAdapters, safeFailure, type Adapter } from '../bridge/providers';
import { orchestrate } from './orchestrator';

const authInput=z.object({email:z.string().email().max(254).transform(x=>x.toLowerCase().trim()),password:z.string().min(12).max(128),name:text.optional()});
export async function authenticate(db:Db,action:string,input:unknown) {
 const v=authInput.parse(input);
 await rateLimit(db,`auth:${hash(v.email)}`,8,900);
 await rateLimit(db,'auth:global',150,60);
 let user:User;
 if(action==='register') {
  demand(v.name,'Informe seu nome.',400);
  if(process.env.NEXUS_REGISTRATION_CODE) demand((input as {registrationCode?:string}).registrationCode===process.env.NEXUS_REGISTRATION_CODE,'Código de cadastro inválido.');
  user={id:randomUUID(),email:v.email,name:v.name};
  const secret=await passwordHash(v.password);
  const rows=await db.query(`INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4) ON CONFLICT(email) DO NOTHING RETURNING id`,[user.id,user.email,user.name,secret]);
  demand(rows.length,'Não foi possível cadastrar. Tente entrar.',409);
 } else {
  const [row]=await db.query<User & {password_hash:string}>('SELECT * FROM users WHERE email=$1',[v.email]);
  // Equal-cost password derivation for unknown accounts.
  const valid=await passwordMatches(v.password,row?.password_hash??'00000000000000000000000000000000:'+ '00'.repeat(64));
  demand(row && valid,'E-mail ou senha incorretos.',401); user={id:row.id,email:row.email,name:row.name};
 }
 const session=token();
 await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",[hash(session),user.id]);
 return {user,session};
}
export async function snapshot(db:Db,user:User,roomId?:string) {
 await db.query('DELETE FROM import_drafts WHERE expires_at<now()');
 const rooms=await db.query('SELECT r.* FROM rooms r JOIN room_members m ON m.room_id=r.id WHERE m.user_id=$1 ORDER BY r.created_at',[user.id]);
 const projects=await db.query('SELECT p.* FROM projects p JOIN project_members m ON m.project_id=p.id WHERE m.user_id=$1',[user.id]);
 const connections=await db.query(`SELECT id,owner_id,provider,model,name,available,status,token_budget,tokens_spent,tokens_reserved,budget_micro,spent_micro,reserved_micro,input_rate,output_rate FROM connections WHERE owner_id=$1 ORDER BY created_at`,[user.id]);
 const base={user,rooms,projects,connections,memories:await visibleMemories(db,user,roomId)};
 if(!roomId)return {...base,messages:[],agents:[],members:[],usage:[],audit:[]};
 const room=await member(db,user,roomId);
 const agents=await db.query(`SELECT c.id,c.owner_id,u.name AS owner_name,c.provider,c.model,c.name,c.available,c.status,rc.policy,rc.payer,rc.active FROM connections c
 JOIN room_connections rc ON rc.connection_id=c.id JOIN users u ON u.id=c.owner_id WHERE rc.room_id=$1 AND rc.active=true`,[roomId]);
 const messages=await db.query(`SELECT * FROM (SELECT m.* FROM messages m WHERE m.room_id=$1 ORDER BY created_at DESC,id DESC LIMIT 200) history ORDER BY created_at,id`,[roomId]);
 const members=await db.query('SELECT u.id,u.name FROM users u JOIN room_members m ON m.user_id=u.id WHERE m.room_id=$1',[roomId]);
 const usage=await db.query(`SELECT u.*,c.name AS connection_name FROM usage u JOIN connections c ON c.id=u.connection_id WHERE u.room_id=$1 AND (c.owner_id=$2 OR $3::boolean) ORDER BY u.created_at DESC LIMIT 100`,[roomId,user.id,room.owner_id===user.id]);
 const events=await db.query('SELECT * FROM audit WHERE room_id=$1 ORDER BY created_at DESC LIMIT 100',[roomId]);
 return {...base,room,agents,messages,members,usage,audit:events};
}
const connectionInput=z.object({name:text,provider,model:z.string().trim().regex(/^[a-zA-Z0-9._:/-]{1,120}$/),
 apiKey:z.string().trim().min(8).max(4096),consent:z.literal(true),
 tokenBudget:z.number().int().min(24000).max(100000000),budgetUsd:z.number().min(0.01).max(10000),
 inputRate:z.number().positive().max(10000),outputRate:z.number().positive().max(10000)});
export async function execute(db:Db,user:User,action:string,input:unknown,adapter:Adapter=officialAdapters):Promise<unknown> {
 await rateLimit(db,`ops:${user.id}`,120);
 switch(action) {
 case 'snapshot': {const v=z.object({roomId:uuid.optional()}).parse(input);return snapshot(db,user,v.roomId);}
 case 'createProject': {
  const v=z.object({name:text}).parse(input);const id=randomUUID();
  await db.transaction(async tx=>{await tx.query('INSERT INTO projects(id,owner_id,name) VALUES($1,$2,$3)',[id,user.id,v.name]);await tx.query('INSERT INTO project_members(project_id,user_id) VALUES($1,$2)',[id,user.id]);});return {id};
 }
 case 'createRoom': {
  const v=z.object({name:text,projectId:uuid.optional()}).parse(input);
  if(v.projectId){await projectMember(db,user,v.projectId);const [p]=await db.query<{owner_id:string}>('SELECT owner_id FROM projects WHERE id=$1',[v.projectId]);demand(p.owner_id===user.id,'Somente o dono do projeto cria suas salas.');}const id=randomUUID();
  await db.transaction(async tx=>{await tx.query('INSERT INTO rooms(id,owner_id,name,project_id) VALUES($1,$2,$3,$4)',[id,user.id,v.name,v.projectId??null]);await tx.query('INSERT INTO room_members(room_id,user_id) VALUES($1,$2)',[id,user.id]);});return {id};
 }
 case 'invite': {
  const v=z.object({roomId:uuid,email:z.string().email().max(254).transform(x=>x.toLowerCase()),confirmProjectAccess:z.boolean().default(false)}).parse(input);
  const room=await member(db,user,v.roomId);demand(room.owner_id===user.id);
  if(room.project_id) {const [p]=await db.query<{owner_id:string}>('SELECT owner_id FROM projects WHERE id=$1',[room.project_id]);demand(p.owner_id===user.id && v.confirmProjectAccess,'O dono do projeto deve autorizar a inclusão neste projeto.');}
  const invite=token();await db.query("INSERT INTO invitations(token_hash,room_id,email,expires_at) VALUES($1,$2,$3,now()+interval '24 hours')",[hash(invite),v.roomId,v.email]);
  await audit(db,user.id,'room.invited',v.roomId,v.roomId,{projectAccess:!!room.project_id});return {token:invite,expiresIn:'24 horas'};
 }
 case 'acceptInvite': {
  const v=z.object({token:z.string().min(20).max(100)}).parse(input);
  return db.transaction(async tx=>{
   const [invite]=await tx.query<{room_id:string}>(`UPDATE invitations SET used=true WHERE token_hash=$1 AND email=$2 AND used=false AND expires_at>now() RETURNING room_id`,[hash(v.token),user.email]);demand(invite,'Convite inválido, expirado ou destinado a outro e-mail.');
   await tx.query('INSERT INTO room_members(room_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[invite.room_id,user.id]);
   const [r]=await tx.query<{project_id:string|null}>('SELECT project_id FROM rooms WHERE id=$1',[invite.room_id]);
   if(r.project_id) await tx.query('INSERT INTO project_members(project_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[r.project_id,user.id]);
   await audit(tx,user.id,'room.joined',invite.room_id,invite.room_id);return {id:invite.room_id};
  });
 }
 case 'removeMember': {
  const v=z.object({roomId:uuid,userId:uuid}).parse(input);const room=await member(db,user,v.roomId);
  demand(room.owner_id===user.id && v.userId!==user.id);
  await db.transaction(async tx=>{
   await tx.query('SELECT id FROM connections WHERE owner_id=$1 ORDER BY id FOR NO KEY UPDATE',[v.userId]);
   await tx.query('SELECT rc.connection_id FROM room_connections rc JOIN connections c ON c.id=rc.connection_id WHERE rc.room_id=$1 AND c.owner_id=$2 ORDER BY rc.connection_id FOR UPDATE OF rc',[v.roomId,v.userId]);
   await tx.query('DELETE FROM room_members WHERE room_id=$1 AND user_id=$2',[v.roomId,v.userId]);
   await tx.query('UPDATE room_connections SET active=false WHERE room_id=$1 AND connection_id IN (SELECT id FROM connections WHERE owner_id=$2)',[v.roomId,v.userId]);
   await audit(tx,user.id,'room.member_removed',v.userId,v.roomId);
  });return {ok:true};
 }
 case 'saveConnection': {
  const v=connectionInput.parse(input);const id=randomUUID();
  await db.query(`INSERT INTO connections(id,owner_id,provider,model,name,secret,token_budget,budget_micro,input_rate,output_rate)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,user.id,v.provider,v.model,v.name,seal(v.apiKey,user.id,id),v.tokenBudget,Math.floor(v.budgetUsd*1e6),v.inputRate,v.outputRate]);
  await audit(db,user.id,'connection.authorized',id,null,{provider:v.provider,model:v.model});return {id};
 }
 case 'setConnection': {
  const v=z.object({id:uuid,available:z.boolean(),model:z.string().trim().regex(/^[a-zA-Z0-9._:/-]{1,120}$/).optional(),apiKey:z.string().trim().min(8).max(4096).optional(),inputRate:z.number().positive().max(10000).optional(),outputRate:z.number().positive().max(10000).optional()}).parse(input);
  const [c]=await db.query<Connection>('SELECT * FROM connections WHERE id=$1 AND owner_id=$2',[v.id,user.id]);demand(c);
  demand(!v.model || v.model===c.model || (v.inputRate && v.outputRate),'Informe as tarifas atualizadas ao trocar o modelo.',400);
  await db.query('UPDATE connections SET available=$1,model=$2,secret=$3,status=$4,input_rate=$6,output_rate=$7 WHERE id=$5',[v.available,v.model??c.model,v.apiKey?seal(v.apiKey,user.id,c.id):c.secret,v.apiKey||v.model?'unverified':c.status,c.id,v.inputRate??c.input_rate,v.outputRate??c.output_rate]);
  await audit(db,user.id,'connection.updated',v.id,null,{available:v.available});return {ok:true};
 }
 case 'models': {
  const v=z.object({id:uuid}).parse(input);const [c]=await db.query<Connection>('SELECT * FROM connections WHERE id=$1 AND owner_id=$2',[v.id,user.id]);demand(c);
  try { const models=await adapter.models(c.provider,unseal(c.secret,user.id,c.id));await db.query("UPDATE connections SET status='authenticated' WHERE id=$1",[c.id]);return {models}; }
  catch(e) {throw new Fault(502,safeFailure(e));}
 }
 case 'attach': {
  const v=z.object({roomId:uuid,connectionId:uuid,policy:z.enum(['owner','members']),payer:z.enum(['owner','room']),consent:z.literal(true)}).parse(input);
  const room=await member(db,user,v.roomId);const [c]=await db.query('SELECT 1 FROM connections WHERE id=$1 AND owner_id=$2',[v.connectionId,user.id]);demand(c);
  demand(v.payer==='owner'||room.owner_id===user.id,'Somente o administrador fornece a conexão de orçamento compartilhado.');
  await db.query(`INSERT INTO room_connections(room_id,connection_id,policy,payer) VALUES($1,$2,$3,$4)
   ON CONFLICT(room_id,connection_id) DO UPDATE SET policy=$3,payer=$4,active=true`,[v.roomId,v.connectionId,v.policy,v.payer]);
  await audit(db,user.id,'connection.attached',v.connectionId,v.roomId,{policy:v.policy,payer:v.payer});return {ok:true};
 }
 case 'detach': {
  const v=z.object({roomId:uuid,connectionId:uuid}).parse(input);const room=await member(db,user,v.roomId);
  const [c]=await db.query<Connection>('SELECT * FROM connections WHERE id=$1',[v.connectionId]);demand(c && (c.owner_id===user.id||room.owner_id===user.id));
  await db.query('UPDATE room_connections SET active=false WHERE room_id=$1 AND connection_id=$2',[v.roomId,v.connectionId]);
  await audit(db,user.id,'connection.detached',v.connectionId,v.roomId);return {ok:true};
 }
 case 'roomBudget': {
  const v=z.object({roomId:uuid,budgetUsd:z.number().min(0).max(10000)}).parse(input);const room=await member(db,user,v.roomId);demand(room.owner_id===user.id);
  await db.query('UPDATE rooms SET budget_micro=$1 WHERE id=$2',[Math.floor(v.budgetUsd*1e6),v.roomId]);return {ok:true};
 }
 case 'memorySave': {const v=z.object({id:uuid.optional(),memory:memoryInput}).parse(input);return saveMemory(db,user,v.memory,v.id);}
 case 'memoryRevoke': {const v=z.object({id:uuid,remove:z.boolean().default(false)}).parse(input);return revokeMemory(db,user,v.id,v.remove);}
 case 'memoryExport': {const memories=await db.query(`SELECT m.*,COALESCE((SELECT jsonb_agg(v ORDER BY version) FROM memory_versions v WHERE v.memory_id=m.id),'[]') AS revisions FROM memories m WHERE owner_id=$1 ORDER BY updated_at`,[user.id]);return {version:1,exportedAt:new Date().toISOString(),memories};}
 case 'importPreview': {const v=z.object({filename:text,raw:z.string().max(256000)}).parse(input);return previewImport(db,user,v.filename,v.raw);}
 case 'importConfirm': {
  const v=z.object({draftId:uuid,memory:memoryInput,confirmed:z.literal(true)}).parse(input);
  return db.transaction(async tx=>{
  const [draft]=await tx.query<{content:string;source:string;source_hash:string}>('SELECT * FROM import_drafts WHERE id=$1 AND owner_id=$2 AND expires_at>now() FOR UPDATE',[v.draftId,user.id]);demand(draft,'Prévia expirada. Importe novamente.',400);
  demand(v.memory.content===draft.content,'O conteúdo diverge da prévia.',400);
  const result=await saveMemory(tx,user,v.memory,undefined,draft,true);
  await tx.query('DELETE FROM import_drafts WHERE id=$1 AND owner_id=$2',[v.draftId,user.id]);return result;
  });
 }
 case 'deriveMemory': {
  const v=z.object({roomId:uuid,messageId:uuid,title:text}).parse(input);await member(db,user,v.roomId);
  const [message]=await db.query<{content:string;role:string}>('SELECT content,role FROM messages WHERE id=$1 AND room_id=$2',[v.messageId,v.roomId]);demand(message && message.role!=='error');
  return saveMemory(db,user,{title:v.title,content:message.content.slice(0,12000),origin:'derived',source:`Nexus message ${v.messageId}`,scope:'personal',grants:[]});
 }
 case 'send':return orchestrate(db,user,input,adapter);
 default:throw new Fault(404,'Operação desconhecida.');
 }
}
