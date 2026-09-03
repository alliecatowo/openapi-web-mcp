import type { ApiExecutionResult, CompiledOperation, OperationInvocation } from '../openapi/types.js';
import { currentServer } from './server.js';
import { getSpec } from './context.js';
import { normalizeResponse } from './responses.js';
import { agentExecution } from './state.js';
import { mergeWithLiveValues, readLiveValues } from './fields.js';

/**
 * Runs an operation through Swagger UI's own execution path.
 *
 * This deliberately does not build its own fetch client. Arguments are written
 * into the Swagger store, `specActions.execute` runs the request through the
 * page's configured interceptors, credentials and selected server, and the
 * result is read back out of the store — which is also what renders in the
 * "Try it out" panel, so an agent's call is visible where a person would look.
 *
 * Consequences worth knowing about:
 *  - Swagger's action wrappers swallow exceptions and return undefined, so the
 *    result has to be observed in the store rather than awaited directly.
 *  - The store is keyed by operation, so the merged arguments become that
 *    operation's form state. Executions are therefore serialised.
 */

/** How long to wait for Swagger to record a response before giving up. */
const RESPONSE_TIMEOUT_MS = 120_000;
/** How long to wait for Swagger to resolve an operation's $refs. */
const RESOLVE_TIMEOUT_MS = 3_000;
const POLL_INTERVAL_MS = 25;

function fail(code: string, message: string): ApiExecutionResult {
  return { ok: false, request: { method: '', url: '' }, error: { code, message }, displayedInSwaggerUi: false };
}

/** Swagger's store holds one form per operation, so calls must not interleave. */
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Build the URL we report back. Swagger reports its own; this is the fallback. */
function describeUrl(system: any, op: CompiledOperation, input: OperationInvocation): string {
  const base = currentServer(system, getSpec(system)) || '';
  let path = op.path;
  for (const [name, value] of Object.entries(input.path || {})) {
    path = path.replace(`{${name}}`, encodeURIComponent(String(value)));
  }
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

function writeParameters(system: any, op: CompiledOperation, input: OperationInvocation) {
  const pathMethod = [op.path, op.method];
  const groups: Array<[string, Record<string, unknown> | undefined]> = [
    ['path', input.path],
    ['query', input.query],
    ['header', input.headers]
  ];

  for (const [location, values] of groups) {
    for (const [name, value] of Object.entries(values || {})) {
      if (value === undefined) continue;
      // Swagger serialises arrays and objects according to the parameter's own
      // style/explode rules, so values are handed over unflattened.
      system.specActions?.changeParam?.(pathMethod, name, location, value, false);
    }
  }
}

function writeRequestBody(system: any, op: CompiledOperation, input: OperationInvocation) {
  if (input.body === undefined || !op.requestBody) return;
  const pathMethod = [op.path, op.method];
  const contentType = input.contentType || op.requestBody.mediaType;

  system.oas3Actions?.setRequestContentType?.({ value: contentType, pathMethod });
  const value = typeof input.body === 'string' ? input.body : JSON.stringify(input.body);
  system.oas3Actions?.setRequestBodyValue?.({ value, pathMethod });
}

/**
 * Ask Swagger to resolve the operation, and wait until its parameter list is
 * populated.
 *
 * Both the path item and the operation are resolved: parameters declared once
 * on the path item (a very common OpenAPI shape) are merged into the operation
 * only when the *path item* is resolved. Without that, Swagger collects no
 * value for them and sends the literal `{placeholder}` in the URL.
 */
async function resolveOperation(system: any, op: CompiledOperation) {
  await system.specActions?.requestResolvedSubtree?.(['paths', op.path]);
  await system.specActions?.requestResolvedSubtree?.(['paths', op.path, op.method]);

  const expected = op.raw?.parameters?.length ?? 0;
  const read = () => system.specSelectors?.specJsonWithResolvedSubtrees?.()?.getIn?.(['paths', op.path, op.method]);
  const deadline = Date.now() + RESOLVE_TIMEOUT_MS;

  let node = read();
  while (Date.now() < deadline) {
    const parameters = node?.getIn?.(['parameters']);
    const count = parameters?.size ?? parameters?.length ?? 0;
    if (node && count >= expected) return node;
    await delay(POLL_INTERVAL_MS);
    node = read();
  }
  return node;
}

/** Wait for Swagger to record a new response for this operation. */
async function awaitResponse(system: any, op: CompiledOperation, previous: unknown, signal?: AbortSignal) {
  const deadline = Date.now() + RESPONSE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (signal?.aborted) return undefined;
    const current = system.specSelectors?.responseFor?.(op.path, op.method);
    // Immutable records are replaced wholesale, so identity is the signal.
    if (current && current !== previous) return current.toJS ? current.toJS() : current;
    await delay(POLL_INTERVAL_MS);
  }
  return undefined;
}

export async function executeOperation(
  system: any,
  op: CompiledOperation,
  invocation: OperationInvocation,
  signal?: AbortSignal
): Promise<ApiExecutionResult> {
  if (signal?.aborted) return fail('ABORTED', 'The operation was aborted.');

  const spec = getSpec(system);
  if (!currentServer(system, spec)) return fail('SPEC_INVALID', 'No selected server is available.');

  // Empty or partial arguments fall back to whatever the person already typed
  // into the operation's Try-it-out fields: explicit arguments always win,
  // and the merged set is what gets written, sent, and rendered. Either side
  // of the shared fields can start the work and the other can finish it.
  const { merged: input } = mergeWithLiveValues(op, invocation, readLiveValues(system, op, { truncate: false }));

  // Path parameters are structural: a missing one would silently request a
  // literal "{id}" segment, so they are checked before anything is written.
  for (const name of op.path.match(/\{([^}]+)\}/g) || []) {
    const key = name.slice(1, -1);
    const value = input.path?.[key];
    if (value === undefined || value === null || value === '') {
      return fail('INPUT_INVALID', `Required path parameter ${key} is missing.`);
    }
  }

  const url = describeUrl(system, op, input);

  return serialize(async () => {
    if (signal?.aborted) return fail('ABORTED', 'The operation was aborted.');

    try {
      const operation = await resolveOperation(system, op);
      if (!operation) return fail('SPEC_NOT_READY', 'Swagger UI has not resolved this operation yet.');

      writeParameters(system, op, input);
      writeRequestBody(system, op, input);

      const previous = system.specSelectors?.responseFor?.(op.path, op.method);

      let response: any;
      agentExecution.current = op.key;
      try {
        system.specActions?.execute?.({ path: op.path, method: op.method, operation });
        response = await awaitResponse(system, op, previous, signal);
      } finally {
        agentExecution.current = null;
      }
      if (signal?.aborted) return fail('ABORTED', 'The operation was aborted.');
      if (!response) {
        return fail('SWAGGER_EXECUTION_ERROR', 'Swagger UI did not record a response for this operation.');
      }

      // Swagger reports a transport failure as a recorded error, not a throw.
      if (response.error && response.status === undefined) {
        return {
          ok: false,
          request: { method: op.method.toUpperCase(), url: response.url || url },
          error: { code: 'NETWORK_ERROR', message: 'The request did not complete. CORS or connectivity may have blocked it.' },
          displayedInSwaggerUi: true
        };
      }

      return {
        ok: response.status >= 200 && response.status < 400,
        request: { method: op.method.toUpperCase(), url: response.url || url },
        response: normalizeResponse(response),
        displayedInSwaggerUi: true
      };
    } catch (error: any) {
      if (signal?.aborted) return fail('ABORTED', 'The operation was aborted.');
      return fail(error?.status === 0 ? 'NETWORK_ERROR' : 'SWAGGER_EXECUTION_ERROR', 'Swagger operation execution failed.');
    }
  });
}
