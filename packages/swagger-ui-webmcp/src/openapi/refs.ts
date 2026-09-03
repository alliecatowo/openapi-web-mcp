/**
 * Minimal resolver for local JSON pointers (`#/components/...`).
 *
 * Swagger UI resolves `$ref`s lazily, one operation subtree at a time, so the
 * document the compiler sees still contains raw references. Reusing components
 * is the norm in real specifications, and an unresolved reference is not a
 * cosmetic loss: a `$ref`'d parameter has no `name`/`in` and disappears from the
 * generated tool, and a `$ref`'d request body compiles to a bare object with no
 * required fields.
 *
 * Only same-document pointers are followed. External and remote references are
 * left as-is: fetching them would mean the plugin making its own network
 * requests, which is exactly what it must not do.
 */

const MAX_HOPS = 10;

const unescapeToken = (token: string) => token.replace(/~1/g, '/').replace(/~0/g, '~');

function pointerTarget(document: any, pointer: string): unknown {
  return pointer
    .slice(2)
    .split('/')
    .map(unescapeToken)
    .reduce<any>((node, token) => (node == null ? undefined : node[token]), document);
}

/**
 * Follow `$ref` chains within the document. Returns the original node when the
 * reference is external, missing, or cyclic, so a bad pointer degrades to
 * "unresolved" rather than throwing or looping.
 */
export function deref<T = any>(document: any, node: T, seen: Set<string> = new Set()): T {
  let current: any = node;

  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    const ref = current && typeof current === 'object' ? current.$ref : undefined;
    if (typeof ref !== 'string') return current;
    if (!ref.startsWith('#/')) return current;
    if (seen.has(ref)) return current;

    seen.add(ref);
    const target = pointerTarget(document, ref);
    if (target == null || typeof target !== 'object') return current;

    // Sibling keys alongside $ref are allowed in OpenAPI 3.1 and override the target.
    const { $ref: _ignored, ...siblings } = current as Record<string, unknown>;
    current = Object.keys(siblings).length ? { ...(target as object), ...siblings } : target;
  }

  return current;
}
