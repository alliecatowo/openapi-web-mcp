const reserved=new Set(['authorization','proxy-authorization','cookie','set-cookie','x-api-key','api-key','token','secret']);
export function isSensitiveName(name:string){const n=name.toLowerCase();return [...reserved].some(x=>n===x||n.includes(x))||/(^|[-_])key$/.test(n)}
export function safeTitle(op:any,method:string,path:string){const raw=typeof op?.operationId==='string'?op.operationId.replace(/([a-z])([A-Z])/g,'$1 $2'):'';const title=(raw||method+' '+path).replace(/[^\w ./-]/g,' ').replace(/\s+/g,' ').trim();return title.slice(0,80)||method+' '+path}
export const structuralDescription=(group:string,name:string)=>`${group} parameter "${name}".`;
