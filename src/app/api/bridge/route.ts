import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { database } from '@/modules/storage/db';
import { authenticate, execute } from '@/modules/core/service';
import { sessionUser, hash } from '@/modules/identity/security';
import { Fault, demand } from '@/modules/core/domain';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
const COOKIE='nexus_session';
export async function POST(request:NextRequest) {
 try {
  const configured=process.env.APP_ORIGIN;
  if(process.env.NODE_ENV==='production' && !configured)throw new Error('APP_ORIGIN required');
  const expected=configured??new URL(request.url).origin;
  if (request.headers.get('origin') !== expected) {
  console.warn(JSON.stringify({
    originRecebido: request.headers.get('origin'),
    appOriginEsperado: expected,
    host: request.headers.get('host'),
    forwardedHost: request.headers.get('x-forwarded-host')
  }));
}
  demand(request.headers.get('origin')===expected,'Origem não autorizada.');
  demand(request.headers.get('content-type')?.startsWith('application/json'),'Envie JSON.',415);
  const reader=request.body?.getReader();demand(reader,'Corpo ausente.',400);
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>300000){await reader.cancel();throw new Fault(413,'Solicitação excede 300 KB.');}chunks.push(part.value);}
  let parsed:unknown;try{parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Fault(400,'JSON inválido.');}
  const {action,data}=z.object({action:z.string().max(40),data:z.unknown()}).parse(parsed);
  const db=await database();
  if(action==='login'||action==='register') {
   const result=await authenticate(db,action,data);const response=NextResponse.json({user:result.user});
   response.cookies.set(COOKIE,result.session,{httpOnly:true,secure:expected.startsWith('https:'),sameSite:'strict',path:'/',maxAge:604800});
   response.headers.set('Cache-Control','no-store');return response;
  }
  const session=request.cookies.get(COOKIE)?.value;
  const user=await sessionUser(db,session);
  if(action==='logout') {
   await db.query('DELETE FROM sessions WHERE token_hash=$1',[hash(session!)]);
   const response=NextResponse.json({ok:true});response.cookies.set(COOKIE,'',{httpOnly:true,path:'/',maxAge:0});return response;
  }
  const result=await execute(db,user,action,data);
  return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
 } catch(error) {
  const status=error instanceof Fault?error.status:error instanceof ZodError?400:500;
  // Never log request bodies, SDK errors, passwords, cookies, or keys.
  const message=error instanceof Fault?error.message:error instanceof ZodError?'Dados inválidos. Confira os campos.':'Falha interna. Consulte a configuração do servidor.';
  return NextResponse.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
 }
}
