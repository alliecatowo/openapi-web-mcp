import type { CompiledOperation, HttpMethod } from './types.js';
import { compileSchema } from './schema.js';
import { safeTitle, structuralDescription, isSensitiveName } from './sanitize.js';
import { hashTextSync } from './hash.js';
import { readAnnotation } from '../policy/index.js';
import { deref } from './refs.js';

const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);
const READ_ONLY_METHODS = new Set(['get', 'head', 'options']);
const BINARY_MEDIA = /multipart|octet-stream|pdf/;

/** Derive a stable, character-safe tool name segment from an operation. */
function nameFor(op: any, method: string, path: string): string {
  const base = op.operationId || `${method}_${path.replace(/[{}]/g, '').replace(/[^A-Za-z0-9_.-]+/g, '_')}`;
  return (
    base
      .replace(/[^A-Za-z0-9_.-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^[-._]+|[-._]+$/g, '')
      .slice(0, 100) || method
  );
}

/** Pick the request media type this version can construct arguments for. */
function bodyMedia(requestBody: any): { mediaType: string; supportedMediaTypes: string[] } | undefined {
  const content = requestBody?.content || {};
  const keys = Object.keys(content);
  const chosen =
    keys.find((x) => x === 'application/json') ||
    keys.find((x) => x.endsWith('+json')) ||
    keys.find((x) => x === 'application/x-www-form-urlencoded') ||
    keys.find((x) => x === 'text/plain');
  return chosen ? { mediaType: chosen, supportedMediaTypes: keys } : undefined;
}

export function enumerateOperations(spec: any): CompiledOperation[] {
  const result: CompiledOperation[] = [];
  const paths = spec?.paths || {};
  const documentAnnotation = readAnnotation(spec?.['x-webmcp']);

  for (const [path, item] of Object.entries<any>(paths)) {
    if (!item || typeof item !== 'object') continue;

    for (const method of Object.keys(item)) {
      if (!METHODS.has(method)) continue;
      const op = item[method] || {};

      // Path-level parameters are inherited; operation-level entries win on
      // collision. Each is dereferenced first, since a `$ref`'d parameter has no
      // name or location of its own and would otherwise be dropped silently.
      const merged = [...(item.parameters || []), ...(op.parameters || [])].map((p) => deref(spec, p));
      const params = new Map<string, any>();
      for (const p of merged) {
        if (p?.name && p.in && !isSensitiveName(p.name)) params.set(`${p.name}|${p.in}`, p);
      }

      const props: any = {};
      const requiredGroups: string[] = [];
      for (const p of params.values()) {
        const group = p.in === 'path' ? 'path' : p.in === 'query' ? 'query' : p.in === 'header' ? 'headers' : null;
        if (!group) continue;
        props[group] ??= { type: 'object', properties: {}, additionalProperties: false };
        props[group].properties[p.name] = {
          ...compileSchema(p.schema || {}, 0, spec),
          description: structuralDescription(group, p.name)
        };
        if (p.required || p.in === 'path') (props[group].required ??= []).push(p.name);
        if ((props[group].required || []).length) requiredGroups.push(group);
      }

      const rawRequestBody = deref(spec, op.requestBody);
      const requestBody = bodyMedia(rawRequestBody);
      let supported = true;
      let unsupportedReason: string | undefined;

      const mediaTypes = Object.keys(rawRequestBody?.content || {});
      if (mediaTypes.some((x) => BINARY_MEDIA.test(x))) {
        supported = false;
        unsupportedReason = 'binary request bodies are not exposed as direct WebMCP tools in v1';
      }
      if (requestBody) {
        props.body = compileSchema(rawRequestBody.content[requestBody.mediaType]?.schema || {}, 0, spec);
      }

      const inputSchema: any = { type: 'object', properties: props, additionalProperties: false };
      if (requiredGroups.length) inputSchema.required = [...new Set(requiredGroups)];

      const key = `${method.toUpperCase()} ${path}`;
      const base = nameFor(op, method, path);
      // The raw operation is part of the hash, so an `x-webmcp` change re-registers the tool.
      const hash = hashTextSync(JSON.stringify({ key, op, schema: inputSchema }));

      result.push({
        key,
        method: method as HttpMethod,
        path,
        operationId: op.operationId,
        tags: Array.isArray(op.tags) ? op.tags : [],
        displayTitle: safeTitle(op, method.toUpperCase(), path),
        summary: typeof op.summary === 'string' ? op.summary.slice(0, 300) : undefined,
        description: typeof op.description === 'string' ? op.description : undefined,
        deprecated: op.deprecated === true,
        toolBaseName: base,
        toolName: `api.${base}.${hash}`,
        inputSchema,
        readOnly: READ_ONLY_METHODS.has(method),
        supported,
        unsupportedReason,
        requestBody,
        annotation: readAnnotation(op['x-webmcp']),
        documentAnnotation,
        generationHash: hash,
        raw: { ...op, parameters: [...params.values()] }
      });
    }
  }

  return result;
}
