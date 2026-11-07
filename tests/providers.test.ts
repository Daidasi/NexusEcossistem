import { afterEach, describe, expect, it, vi } from 'vitest';
import { officialAdapters, safeFailure } from '../src/modules/bridge/providers';
const credentials='TEST_SYNTHETIC_API_KEY_NOT_VALID';
const request={model:'test-model',apiKey:credentials,system:'Trusted system policy',input:'Untrusted user context',maxOutput:1024};
afterEach(()=>vi.unstubAllGlobals());
describe('Official SDK adapter contracts with controlled HTTP fixtures (no live APIs)',()=>{
 it('OpenAI uses Responses without storage and parses attributed text/usage',async()=>{
  const fetcher=vi.fn(async()=>Response.json({id:'resp_test',object:'response',status:'completed',output:[{type:'message',id:'msg_test',role:'assistant',status:'completed',content:[{type:'output_text',text:'FIXTURE_OPENAI',annotations:[]}]}],usage:{input_tokens:11,output_tokens:12,total_tokens:23}}));
  vi.stubGlobal('fetch',fetcher);
  expect(await officialAdapters.complete({...request,provider:'openai'})).toEqual({text:'FIXTURE_OPENAI',inputTokens:11,outputTokens:12});
  const calls=fetcher.mock.calls as unknown as [string,RequestInit][];expect(String(calls[0][0])).toContain('api.openai.com/v1/responses');
  const body=JSON.parse(String(calls[0][1].body));expect(body.store).toBe(false);expect(body.instructions).toBe(request.system);expect(body.max_output_tokens).toBe(1024);
 });
 it('Anthropic separates system from user context and parses Messages usage',async()=>{
  const fetcher=vi.fn(async()=>Response.json({id:'msg_test',type:'message',role:'assistant',model:'test-model',content:[{type:'text',text:'FIXTURE_CLAUDE'}],stop_reason:'end_turn',usage:{input_tokens:21,output_tokens:22}}));
  vi.stubGlobal('fetch',fetcher);
  expect(await officialAdapters.complete({...request,provider:'anthropic'})).toEqual({text:'FIXTURE_CLAUDE',inputTokens:21,outputTokens:22});
  const calls=fetcher.mock.calls as unknown as [string,RequestInit][];expect(String(calls[0][0])).toContain('api.anthropic.com/v1/messages');
  const body=JSON.parse(String(calls[0][1].body));expect(body.system).toBe(request.system);expect(body.messages[0].role).toBe('user');expect(body.max_tokens).toBe(1024);
 });
 it('Gemini counts reasoning output and uses generateContent',async()=>{
  const fetcher=vi.fn(async()=>Response.json({candidates:[{content:{role:'model',parts:[{text:'FIXTURE_GEMINI'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:31,candidatesTokenCount:32,thoughtsTokenCount:3}}));
  vi.stubGlobal('fetch',fetcher);
  expect(await officialAdapters.complete({...request,provider:'google'})).toEqual({text:'FIXTURE_GEMINI',inputTokens:31,outputTokens:35});
  const calls=fetcher.mock.calls as unknown as [string,RequestInit][];expect(String(calls[0][0])).toContain('generativelanguage.googleapis.com');expect(String(calls[0][0])).toContain(':generateContent');
  const body=JSON.parse(String(calls[0][1].body));expect(body.generationConfig.maxOutputTokens).toBe(1024);expect(JSON.stringify(body.systemInstruction)).toContain(request.system);
 });
 it('redacts arbitrary SDK error details',()=>{
  for(const status of [400,401,403,404,429,500])expect(safeFailure({status,message:credentials})).not.toContain(credentials);
 });
});
