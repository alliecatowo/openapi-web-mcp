import {expect,it} from 'vitest';import {normalizeResponse} from '../../src/swagger/responses.js';import {operationDefinition} from '../../src/webmcp/operation-tool.js';it('bounds bodies and redacts secrets',()=>{const r=normalizeResponse({status:200,headers:{authorization:'secret-value','content-type':'text/plain'},body:'x'.repeat(60_000)});expect(JSON.stringify(r)).not.toContain('secret-value');expect(r.truncated).toBe(true);expect((r.body as any).originalBytes).toBeGreaterThan(50_000)});it('refuses a write held at read without asking anyone',async()=>{
  const op={method:'post',path:'/tasks',key:'POST /tasks',tags:[],displayTitle:'Create task',toolBaseName:'create',toolName:'api.create.abc',inputSchema:{type:'object'},readOnly:false,supported:true,generationHash:'abc',raw:{}} as any;
  const gate={pageExposure:'read' as const,trustSpecAnnotations:false,authorizedSchemes:[]};
  const result:any=await operationDefinition({},op,new AbortController().signal,()=>gate).execute({},{});
  expect(result.error.code).toBe('READ_ONLY_MODE');
});
