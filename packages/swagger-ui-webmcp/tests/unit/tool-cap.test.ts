import { describe, expect, it } from 'vitest';
import { installWebMcpShim } from '../../../../tests/webmcp-shim.js';
import { WebMcpRegistry } from '../../src/webmcp/registry.js';
import { fakeSwagger } from '../support/fake-swagger.js';

/**
 * When a document has more operations than `maxDirectOperationTools`,
 * `rebuild()` registers zero direct per-operation tools for it (discovery and
 * the generic `openapi_execute_operation`/`openapi_execute_batch` tools stay
 * available instead, per the doc comment on `RegistryConfig`). This spec was
 * previously untested.
 *
 * Auditing it surfaced a real inconsistency: `search()` and `get()` report a
 * `directTool` name for every operation using `registrable()`, which never
 * looked at the cap at all. So once a document crossed the cap, those two
 * discovery tools kept telling an agent "call `api.getItemN.<hash>` directly"
 * for a tool that `rebuild()` never registered — the discovery metadata and
 * the actual registered tool set disagreed. `directToolNames`/`hasDirectTool`
 * below read through `search()`, and `tools` reads the shim's real registered
 * set, so the same assertions catch both the missing-coverage gap and that
 * mismatch.
 */

function manyOperationsSpec(count: number) {
  const paths: Record<string, any> = {};
  for (let i = 0; i < count; i += 1) {
    paths[`/items/${i}`] = { get: { operationId: `getItem${i}` } };
  }
  return { openapi: '3.1.0', info: { title: 'Cap fixture', version: '1.0.0' }, servers: [{ url: 'https://api.test' }], paths };
}

function makeRegistry(count: number, maxDirectOperationTools: number) {
  const swagger = fakeSwagger(manyOperationsSpec(count));
  swagger.respondWith({ status: 200, body: { ok: true } });
  const registry = new WebMcpRegistry(swagger.system, { maxDirectOperationTools });
  return { swagger, registry };
}

describe('the direct-tool cap fallback', () => {
  it('registers no direct per-operation tools once the document exceeds the cap, keeping the four core tools', () => {
    const { tools } = installWebMcpShim();
    const { registry } = makeRegistry(5, 2);
    registry.initialize();

    const registeredNames = [...tools.keys()];
    expect(registeredNames).toEqual(
      expect.arrayContaining(['openapi_get_context', 'openapi_search_operations', 'openapi_get_operation', 'openapi_execute_operation', 'openapi_execute_batch'])
    );
    expect(registeredNames.filter((name) => name.startsWith('api.'))).toHaveLength(0);
  });

  it('still registers direct tools when the document is within the cap', () => {
    const { tools } = installWebMcpShim();
    const { registry } = makeRegistry(2, 5);
    registry.initialize();
    expect([...tools.keys()].filter((name) => name.startsWith('api.'))).toHaveLength(2);
  });

  it('does not advertise a directTool through search() for an operation that has none registered', () => {
    installWebMcpShim();
    const { registry } = makeRegistry(5, 2);
    registry.initialize();
    const found = registry.search({}).operations;
    expect(found).toHaveLength(5);
    expect(found.every((op: any) => op.directTool === undefined)).toBe(true);
  });

  it('does not advertise a directTool through get() either', () => {
    installWebMcpShim();
    const { registry } = makeRegistry(5, 2);
    registry.initialize();
    expect((registry.get('getItem0') as any).directTool).toBeUndefined();
  });
});
