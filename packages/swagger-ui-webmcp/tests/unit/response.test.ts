import {expect,it} from 'vitest';import {normalizeResponse} from '../../src/swagger/responses.js';import {operationDefinition} from '../../src/webmcp/operation-tool.js';import {fakeConsole} from '../support/fake-console.js';it('bounds bodies and redacts secrets',()=>{const r=normalizeResponse({status:200,headers:{authorization:'secret-value','content-type':'text/plain'},body:'x'.repeat(60_000)});expect(JSON.stringify(r)).not.toContain('secret-value');expect(r.truncated).toBe(true);expect((r.body as any).originalBytes).toBeGreaterThan(50_000)});it('refuses a write under a read-only page without asking anyone',async()=>{
 const console=fakeConsole();
 const op={method:'post',path:'/tasks',key:'POST /tasks',tags:[],displayTitle:'Create task',toolBaseName:'create',toolName:'api.create.abc',inputSchema:{type:'object'},readOnly:false,supported:true,generationHash:'abc',raw:{}} as any;
 const gate={pageMode:'read-only' as const,trustSpecAnnotations:false,console,remembered:new Set<string>()};
 const result:any=await operationDefinition({},op,new AbortController().signal,()=>gate).execute({},{});
 expect(result.error.code).toBe('READ_ONLY_MODE');
 expect(console.prompts).toHaveLength(0);
});
