const reserved=new Set(['authorization','proxy-authorization','cookie','set-cookie','x-api-key','api-key','token','secret','password']);
// Header/parameter names are conventionally hyphenated ("X-API-Key"); JSON body
// property names are conventionally camelCase ("apiKey") with no separator at
// all. Insert one at each lowercase-to-uppercase boundary before lowercasing,
// so both spellings normalize to the same form and hit the same checks below.
export function isSensitiveName(name:string){const n=name.replace(/([a-z0-9])([A-Z])/g,'$1-$2').toLowerCase();return [...reserved].some(x=>n===x||n.includes(x))||/(^|[-_])key$/.test(n)}
export function safeTitle(op:any,method:string,path:string){const raw=typeof op?.operationId==='string'?op.operationId.replace(/([a-z])([A-Z])/g,'$1 $2'):'';const title=(raw||method+' '+path).replace(/[^\w ./-]/g,' ').replace(/\s+/g,' ').trim();return title.slice(0,80)||method+' '+path}
export const structuralDescription=(group:string,name:string)=>`${group} parameter "${name}".`;
