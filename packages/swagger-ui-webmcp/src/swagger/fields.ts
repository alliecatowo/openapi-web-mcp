import type { CompiledOperation, OperationInvocation } from '../openapi/types.js';
import { isSensitiveName } from '../openapi/sanitize.js';

/**
 * Bidirectional field sharing with Swagger UI's own Try-it-out forms.
 *
 * The agent and the person use the same fields, in the same store — there are
 * no shadow copies. Two directions:
 *
 * - Reads: `openapi_get_operation` reports `liveValues`, whatever the person
 *   has already typed into the operation's Try-it-out fields, so the agent
 *   sees work in progress instead of clobbering it.
 * - Writes: executing with empty or partial arguments falls back to the
 *   current UI values for the missing pieces (explicit arguments always win),
 *   writes the merged set back through Swagger's own pipeline, and the
 *   populated fields plus the response render in Swagger UI's own panels.
 *   "The person types half, the agent finishes and submits" and "the agent
 *   fills, the person reviews, the agent submits" both work on the same
 *   fields.
 *
 * Reads are bounded like every other agent-visible surface: long values are
 * truncated, and parameter names that look like credentials are never
 * surfaced or merged.
 */

/** Longest single live value reported to or executed for the agent. */
export const MAX_LIVE_VALUE_CHARS = 8192;

export interface LiveValues {
  path?: Record<string, unknown>;
  query?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  body?: unknown;
  contentType?: string;
}

const toJs = (value: any): any => (value?.toJS ? value.toJS() : value);

function plain(value: unknown, truncate: boolean): unknown {
  const js = toJs(value);
  if (truncate && typeof js === 'string' && js.length > MAX_LIVE_VALUE_CHARS) {
    return `${js.slice(0, MAX_LIVE_VALUE_CHARS)}…`;
  }
  return js;
}

/** True when a stored value counts as "typed": present and not blank. */
export function hasLiveValue(value: unknown): boolean {
  const js = toJs(value);
  if (js === undefined || js === null) return false;
  if (typeof js === 'string') return js !== '';
  if (Array.isArray(js)) return js.length > 0;
  if (typeof js === 'object') return Object.keys(js).length > 0;
  return true;
}

/**
 * Read whatever is currently in the operation's Try-it-out fields from the
 * Swagger store: parameter values via `parameterWithMeta`, the request body
 * via the oas3 selectors. Returns only declared, non-sensitive fields.
 * Reporting truncates long values; execution merges full ones (they are the
 * person's own typed input, bound for the API they already chose).
 */
/**
 * Read one parameter's current form value out of the Swagger store.
 *
 * Three readers, in order, because no single selector is reliable across the
 * whole lifecycle:
 *  - `parameterValues` returns a plain `"<in>.<name>" -> value` map and is the
 *    cheapest correct answer once a value has been committed.
 *  - `parameterWithMeta` merges meta onto the parameter record, but while an
 *    operation's `$ref`s are still resolving it maps an unresolved parameter
 *    list and Swagger UI throws a TypeError.
 *  - `getParameter` never throws, but returns the spec record *without* the
 *    meta value merged, so it can only confirm the parameter exists — reading
 *    `value` off it always yields undefined. It is last, and only ever used
 *    when it actually carries a value.
 *
 * Each reader is guarded independently so one throwing does not hide the next.
 */
function readParamValue(system: any, pathMethod: string[], param: any): unknown {
  const key = `${param.in}.${param.name}`;

  try {
    const values = system.specSelectors?.parameterValues?.(pathMethod);
    const found = values?.get ? values.get(key) : undefined;
    if (found !== undefined) return found;
  } catch {
    /* Unresolved subtree: fall through. */
  }

  try {
    const withMeta = system.specSelectors?.parameterWithMeta?.(pathMethod, param.name, param.in);
    const found = withMeta?.get ? withMeta.get('value') : undefined;
    if (found !== undefined) return found;
  } catch {
    /* Swagger logs a TypeError mid-resolution; the reader above usually wins. */
  }

  try {
    const stored = system.specSelectors?.getParameter?.(pathMethod, param.name, param.in);
    return stored?.get ? stored.get('value') : undefined;
  } catch {
    return undefined;
  }
}

export function readLiveValues(system: any, op: CompiledOperation, options: { truncate?: boolean } = {}): LiveValues {
  const truncate = options.truncate !== false;
  const live: LiveValues = {};
  const pathMethod = [op.path, op.method];

  for (const param of op.raw?.parameters || []) {
    const group = param.in === 'path' ? 'path' : param.in === 'query' ? 'query' : param.in === 'header' ? 'headers' : null;
    if (!group || !param.name || isSensitiveName(param.name)) continue;
    const value = readParamValue(system, pathMethod, param);
    if (!hasLiveValue(value)) continue;
    (live[group] ??= {})[param.name] = plain(value, truncate);
  }

  if (op.requestBody) {
    try {
      const contentType = toJs(system.oas3Selectors?.requestContentType?.(op.path, op.method));
      if (typeof contentType === 'string' && contentType) live.contentType = contentType;
      const body = toJs(system.oas3Selectors?.requestBodyValue?.(op.path, op.method));
      if (hasLiveValue(body)) live.body = plain(unpackBody(body), truncate);
    } catch {
      /* Selectors are version-coupled; absence degrades to no live body. */
    }
  }

  return live;
}

/**
 * Swagger stores the request body per media type in newer versions (a map of
 * media type to value) and as a bare value in older ones. Unpack one level so
 * the agent sees the text it would submit.
 */
function unpackBody(body: any): unknown {
  if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
    const entries = Object.entries(body);
    if (entries.length === 1 && typeof entries[0][1] !== 'object') return entries[0][1];
  }
  return body;
}

/**
 * Merge explicit tool arguments over the live UI values. Explicit arguments
 * always win; missing pieces fall back to what the person already typed.
 * Returns the merged invocation plus whether any UI value was used, so
 * callers can say so honestly.
 */
export function mergeWithLiveValues(
  op: CompiledOperation,
  input: OperationInvocation,
  live: LiveValues
): { merged: OperationInvocation; usedLiveValues: boolean } {
  const merged: OperationInvocation = {
    path: { ...(live.path || {}), ...(input.path || {}) },
    query: { ...(live.query || {}), ...(input.query || {}) },
    headers: { ...(live.headers || {}), ...(input.headers || {}) }
  };

  let usedLiveValues = false;
  for (const group of ['path', 'query', 'headers'] as const) {
    const liveGroup = live[group] || {};
    const inputGroup = input[group] || {};
    for (const name of Object.keys(liveGroup)) {
      if (inputGroup[name] === undefined && hasLiveValue((liveGroup as Record<string, unknown>)[name])) {
        usedLiveValues = true;
      }
    }
    if (Object.keys(merged[group] || {}).length === 0) delete merged[group];
  }

  if (input.body !== undefined) {
    merged.body = input.body;
  } else if (op.requestBody && hasLiveValue(live.body)) {
    merged.body = coerceBody(live.body);
    usedLiveValues = true;
  }

  merged.contentType = input.contentType ?? live.contentType;

  return { merged, usedLiveValues };
}

/**
 * The UI holds body text; the pipeline accepts a string or a parsed value.
 * Keep text as text — `setRequestBodyValue` takes the raw string — and only
 * pass structured values through.
 */
function coerceBody(body: unknown): unknown {
  if (typeof body !== 'string') return body;
  const trimmed = body.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return body;
    }
  }
  return body;
}
