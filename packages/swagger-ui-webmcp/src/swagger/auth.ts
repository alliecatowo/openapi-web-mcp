import {js} from './context.js';import {isSensitiveName} from '../openapi/sanitize.js';
export function authorizedSchemes(system:any){const auth=js(system.authSelectors?.authorized?.()||{});return Object.entries(auth).map(([name,v]:any)=>({name,type:v?.schema?.type||v?.type}))}
export function redactHeaders(headers:Record<string,unknown>={}){return Object.fromEntries(Object.entries(headers).filter(([k])=>!isSensitiveName(k)))}
