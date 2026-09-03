import { deref } from './refs.js';

/** JSON Schema keywords that carry structure rather than prose. */
const STRUCTURAL_KEYWORDS = [
  'type',
  'properties',
  'required',
  'items',
  'enum',
  'const',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'pattern',
  'format',
  'additionalProperties',
  'oneOf',
  'anyOf',
  'allOf',
  'default'
] as const;

const COMPOSITE_KEYWORDS = new Set(['oneOf', 'anyOf', 'allOf']);
const MAX_DEPTH = 8;

/**
 * Reduce an OpenAPI schema to structure a tool caller can rely on.
 *
 * Descriptions, examples, titles and external documentation are dropped: that
 * text comes from an untrusted document and must not reach a model as though it
 * were instruction. Local `$ref`s are followed so shared components still
 * produce useful schemas; `seen` breaks recursive definitions.
 */
export function compileSchema(
  input: any,
  depth = 0,
  document?: any,
  seen: Set<string> = new Set()
): Record<string, unknown> {
  if (depth > MAX_DEPTH || input == null) return { type: 'object' };
  if (typeof input !== 'object') return {};

  const resolved = document ? deref(document, input, new Set(seen)) : input;
  if (resolved && typeof resolved === 'object' && typeof (resolved as any).$ref === 'string') {
    // Unresolvable (external or cyclic): describe it as an opaque object.
    return { type: 'object' };
  }

  // Track this reference so a self-referential component terminates.
  const nextSeen = typeof input?.$ref === 'string' ? new Set([...seen, input.$ref]) : seen;

  const out: any = {};
  for (const keyword of STRUCTURAL_KEYWORDS) {
    const value = (resolved as any)[keyword];
    if (value === undefined) continue;

    if (keyword === 'properties') {
      out.properties = {};
      for (const [name, child] of Object.entries(value as Record<string, unknown>)) {
        out.properties[name] = compileSchema(child, depth + 1, document, nextSeen);
      }
    } else if (keyword === 'items') {
      out.items = compileSchema(value, depth + 1, document, nextSeen);
    } else if (COMPOSITE_KEYWORDS.has(keyword)) {
      out[keyword] = (value as any[]).map((child) => compileSchema(child, depth + 1, document, nextSeen));
    } else if (keyword === 'additionalProperties' && value && typeof value === 'object') {
      out.additionalProperties = compileSchema(value, depth + 1, document, nextSeen);
    } else {
      out[keyword] = value;
    }
  }

  // OpenAPI 3.0 spelled nullability as a sibling keyword.
  if ((resolved as any).nullable === true) {
    if (out.type) out.type = Array.isArray(out.type) ? [...out.type, 'null'] : [out.type, 'null'];
    else out.type = ['object', 'null'];
  }

  // A read-only property is server-owned; callers must not be asked to send it.
  if ((resolved as any).readOnly === true) return {};

  return out;
}
