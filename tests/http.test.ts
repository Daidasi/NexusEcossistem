import { describe,it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
const base=process.env.NEXUS_E2E_URL;
describe.skipIf(!base)('Real HTTP end-to-end (no provider simulations)',()=>{
 it('register → room → invite → two sessions → persistent conversation → private/shared memory → logout and isolation',async()=>{
  async function request(action:string,data:unknown={},cookie='',origin=base!) {
   const res=await fetch(`${base}/api/bridge`,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...(cookie?{Cookie:cookie}:{})},body:JSON.stringify({action,data})});
   return {status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]??'',headers:res.headers};
  }
  const emailA=`qa-a-${randomUUID()}@example.test`,emailB=`qa-b-${randomUUID()}@example.test`;
  const password=`QA_only_${randomUUID()}`;
  const a=await request('register',{name:'QA Alice',email:emailA,password});expect(a.status).toBe(200);expect(a.headers.get('set-cookie')).toContain('HttpOnly');expect(a.headers.get('set-cookie')).toContain('SameSite=strict');
  const b=await request('register',{name:'QA Bob',email:emailB,password});expect(b.status).toBe(200);
  const created=await request('createRoom',{name:'QA HTTP room'},a.cookie);expect(created.status).toBe(200);const roomId=created.body.id;
  expect((await request('snapshot',{roomId},b.cookie)).status).toBe(403);
  expect((await request('snapshot',{roomId},a.cookie,'https://evil.example')).status).toBe(403);
  expect((await request('snapshot',{roomId})).status).toBe(401);
  const inv=await request('invite',{roomId,email:emailB},a.cookie);expect(inv.status).toBe(200);
  expect((await request('acceptInvite',{token:inv.body.token},b.cookie)).status).toBe(200);
  const requestId=randomUUID();expect((await request('send',{roomId,requestId,content:'Real persistent HTTP message',connectionIds:[]},a.cookie)).status).toBe(200);
  const again=await request('send',{roomId,requestId,content:'Real persistent HTTP message',connectionIds:[]},a.cookie);expect(again.body.duplicate).toBe(true);
  const memory=await request('memorySave',{memory:{title:'Private',content:'PRIVATE_HTTP_CANARY',scope:'personal'}},a.cookie);expect(memory.status).toBe(200);
  const shared=await request('memorySave',{memory:{title:'Shared',content:'SHARED_HTTP_CANARY',scope:'room',roomId,confirmSharing:true}},a.cookie);expect(shared.status).toBe(200);
  const snap=await request('snapshot',{roomId},b.cookie);expect(snap.status).toBe(200);expect(JSON.stringify(snap.body)).toContain('Real persistent HTTP message');expect(JSON.stringify(snap.body)).toContain('SHARED_HTTP_CANARY');expect(JSON.stringify(snap.body)).not.toContain('PRIVATE_HTTP_CANARY');
  expect((await request('memoryRevoke',{id:memory.body.id,remove:true},b.cookie)).status).toBe(403);
  expect((await request('memoryRevoke',{id:shared.body.id},a.cookie)).status).toBe(200);
  expect((await request('logout',{},b.cookie)).status).toBe(200);expect((await request('snapshot',{},b.cookie)).status).toBe(401);
  const login=await request('login',{email:emailB,password});expect(login.status).toBe(200);expect(JSON.stringify((await request('snapshot',{roomId},login.cookie)).body)).toContain('Real persistent HTTP message');
  expect((await request('removeMember',{roomId,userId:b.body.user.id},a.cookie)).status).toBe(200);expect((await request('snapshot',{roomId},login.cookie)).status).toBe(403);
 });
 it('rejects oversized bodies and invalid JSON without echoes',async()=>{
  const oversized=await fetch(`${base}/api/bridge`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base!},body:'x'.repeat(300001)});expect(oversized.status).toBe(413);
  const invalid=await fetch(`${base}/api/bridge`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base!},body:'{BAD_SECRET_PAYLOAD'});expect(invalid.status).toBe(400);expect(await invalid.text()).not.toContain('BAD_SECRET_PAYLOAD');
 });
});
