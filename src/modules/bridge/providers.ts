import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import type { Provider } from '../core/domain';
export interface CompletionRequest {provider:Provider;model:string;apiKey:string;system:string;input:string;maxOutput:number}
export interface Completion {text:string;inputTokens:number;outputTokens:number}
export interface Adapter {complete(request:CompletionRequest):Promise<Completion>;models(provider:Provider,apiKey:string):Promise<string[]>}
export const officialAdapters: Adapter = {
 async complete(r) {
  if(r.provider==='openai') {
   const client=new OpenAI({apiKey:r.apiKey,timeout:45000,maxRetries:0});
   const v=await client.responses.create({model:r.model,instructions:r.system,input:r.input,max_output_tokens:r.maxOutput,store:false});
   return {text:v.output_text,inputTokens:v.usage?.input_tokens??0,outputTokens:v.usage?.output_tokens??0};
  }
  if(r.provider==='anthropic') {
   const client=new Anthropic({apiKey:r.apiKey,timeout:45000,maxRetries:0});
   const v=await client.messages.create({model:r.model,system:r.system,messages:[{role:'user',content:r.input}],max_tokens:r.maxOutput});
   return {text:v.content.filter(b=>b.type==='text').map(b=>b.text).join('\n'),inputTokens:v.usage.input_tokens,outputTokens:v.usage.output_tokens};
  }
  const client=new GoogleGenAI({apiKey:r.apiKey,httpOptions:{timeout:45000,retryOptions:{attempts:1}}});
  const v=await client.models.generateContent({model:r.model,contents:r.input,config:{systemInstruction:r.system,maxOutputTokens:r.maxOutput}});
  return {text:v.text??'',inputTokens:v.usageMetadata?.promptTokenCount??0,
   outputTokens:(v.usageMetadata?.candidatesTokenCount??0)+(v.usageMetadata?.thoughtsTokenCount??0)};
 },
 async models(provider,apiKey) {
  if(provider==='openai') {
   const page=await new OpenAI({apiKey,timeout:15000,maxRetries:0}).models.list();
   return page.data.map(m=>m.id).sort();
  }
  if(provider==='anthropic') {
   const page=await new Anthropic({apiKey,timeout:15000,maxRetries:0}).models.list();
   return page.data.map(m=>m.id).sort();
  }
  const page=await new GoogleGenAI({apiKey,httpOptions:{timeout:15000,retryOptions:{attempts:1}}}).models.list({config:{pageSize:100}});
  const ids:string[]=[];
  for await(const model of page) {if(model.name) ids.push(model.name.replace(/^models\//,''));if(ids.length>=100)break;}
  return ids.sort();
 }
};
export function safeFailure(error: unknown): string {
 const status=(error as {status?:number})?.status;
 if(status===401 || status===403) return 'Credencial inválida ou sem autorização no provedor.';
 if(status===429 || status===402) return 'Limite do provedor ou créditos insuficientes.';
 if(status===404 || status===400) return 'Modelo indisponível ou configuração incompatível.';
 return 'O provedor não concluiu a solicitação. Verifique a conexão e tente novamente.';
}
