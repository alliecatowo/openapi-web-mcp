import { beforeEach, describe, expect, it } from 'vitest';
import { enumerateOperations } from '../../src/openapi/enumerate.js';
import { operationDefinition } from '../../src/webmcp/operation-tool.js';
import { WebMcpRegistry } from '../../src/webmcp/registry.js';
import type { GateContext } from '../../src/webmcp/gate.js';
import { fakeSwagger } from '../support/fake-swagger.js';

/** A document exercising every branch of the exposure resolver. */
const SPEC = {
  openapi: '3.1.0',
  info: { title: 'Exposure fixture', version: '1.0.0' },
  servers: [{ url: 'https://api.test' }],
  'x-webmcp': { tool: 'read' },
  paths: {
    '/projects': {
      get: { operationId: 'listProjects' },
      post: { operationId: 'createProject' }
    },
    '/notes': {
      post: {
        operationId: 'createNote',
        'x-webmcp': { tool: 'write' }
      }
    },
    '/projects/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      delete: {
        operationId: 'deleteProject',
        'x-webmcp': { tool: 'write', destructive: true }
      }
    },
    '/billing/charges': {
      post: { operationId: 'createCharge', 'x-webmcp': { tool: 'hidden' } }
    },
    '/usage': {
      get: { operationId: 'getUsage', 'x-webmcp': { tool: 'read', requiresAuth: 'bearerAuth' } }
    },
    '/exports': {
      post: {
        operationId: 'createExport',
        'x-webmcp': { tool: 'write', costHint: 'Bills the account per export' }
      }
    }
  }
};

function makeRegistry(config: Record<string, unknown> = {}) {
  const swagger = fakeSwagger(SPEC);
  swagger.respondWith({ status: 201, body: { ok: true } });
  const registry = new WebMcpRegistry(swagger.system, config);
  return { swagger, registry };
}

const gateFor = (config: Partial<GateContext> = {}): GateContext => ({
  pageExposure: 'write',
  trustSpecAnnotations: false,
  authorizedSchemes: [],
  ...config
});

let ops: ReturnType<typeof enumerateOperations>;
beforeEach(() => {
  ops = enumerateOperations(SPEC);
});

describe('hidden operations are invisible, not merely blocked', () => {
  it('keeps a hidden operation out of search, inspection, and execution entirely', async () => {
    const { swagger, registry } = makeRegistry();
    expect(registry.search({}).operations.map((op: any) => op.key)).not.toContain('POST /billing/charges');
    expect((registry.get('createCharge') as any).error.code).toBe('OPERATION_NOT_FOUND');

    const result: any = await registry.execute({ operation: 'createCharge', body: { amountCents: 100 } });
    expect(result.error.code).toBe('OPERATION_NOT_FOUND');
    expect(swagger.requests).toHaveLength(0);
  });
});

describe('writes held at read stay visible and explainable', () => {
  it('reports the write in search with a not-callable policy and no direct tool', () => {
    const { registry } = makeRegistry();
    const found: any = registry.search({ query: 'POST /projects' }).operations[0];
    expect(found.agentPolicy).toMatchObject({ exposure: 'read', readOnly: false, callable: false });
    expect(found.directTool).toBeUndefined();
  });

  it('refuses to execute the write with READ_ONLY_MODE and touches no API', async () => {
    const { swagger, registry } = makeRegistry();
    const result: any = await registry.execute({ operation: 'createProject', body: { name: 'Launch' } });
    expect(result.error.code).toBe('READ_ONLY_MODE');
    expect(swagger.requests).toHaveLength(0);
  });
});

describe('SEE vs CALL: authorization-gated operations', () => {
  it('lists the gated operation while unauthorized, with requiresAuth explained', () => {
    const { registry } = makeRegistry();
    const found: any = registry.search({ query: 'getUsage' }).operations[0];
    expect(found.agentPolicy).toMatchObject({
      exposure: 'read',
      callable: false,
      requiresAuth: ['bearerAuth'],
      authorized: false
    });
    expect((registry.get('getUsage') as any).agentPolicy).toMatchObject({
      requiresAuth: ['bearerAuth'],
      authorized: false,
      callable: false
    });
  });

  it('refuses the call with AUTH_REQUIRED while unauthorized and touches no API', async () => {
    const { swagger, registry } = makeRegistry();
    const result: any = await registry.execute({ operation: 'getUsage' });
    expect(result.error.code).toBe('AUTH_REQUIRED');
    expect(result.error.message).toMatch(/bearerAuth/);
    expect(swagger.requests).toHaveLength(0);
  });

  it('runs the same call once the client authorizes, with no re-registration', async () => {
    const { swagger, registry } = makeRegistry();
    expect((await registry.execute({ operation: 'getUsage' }) as any).error.code).toBe('AUTH_REQUIRED');

    swagger.authorize('bearerAuth');

    const result: any = await registry.execute({ operation: 'getUsage' });
    expect(result.ok).toBe(true);
    expect(swagger.requests).toHaveLength(1);
    expect((registry.get('getUsage') as any).agentPolicy).toMatchObject({ authorized: true, callable: true });
  });

  it('accepts any live authorization when the gate says true', async () => {
    const gated = {
      openapi: '3.1.0',
      info: { title: 'T', version: '1' },
      servers: [{ url: 'https://api.test' }],
      paths: { '/me': { get: { operationId: 'getMe', 'x-webmcp': { tool: 'read', requiresAuth: true } } } }
    };
    const swagger = fakeSwagger(gated);
    const registry = new WebMcpRegistry(swagger.system, {});
    expect(((await registry.execute({ operation: 'getMe' })) as any).error.code).toBe('AUTH_REQUIRED');
    swagger.authorize('cookieAuth');
    expect(((await registry.execute({ operation: 'getMe' })) as any).ok).toBe(true);
  });

  it('re-checks live state per call: revoking flips success back to AUTH_REQUIRED', async () => {
    const { swagger, registry } = makeRegistry();
    swagger.authorize('bearerAuth');
    expect(((await registry.execute({ operation: 'getUsage' })) as any).ok).toBe(true);
    swagger.authorize();
    expect(((await registry.execute({ operation: 'getUsage' })) as any).error.code).toBe('AUTH_REQUIRED');
  });
});

describe('exposed operations run without any prompt', () => {
  it('runs a read straight through', async () => {
    const { swagger, registry } = makeRegistry();
    const result: any = await registry.execute({ operation: 'listProjects' });
    expect(result.ok).toBe(true);
    expect(swagger.requests).toHaveLength(1);
  });

  it('runs a write the document promoted to write', async () => {
    const { swagger, registry } = makeRegistry();
    const result: any = await registry.execute({ operation: 'createNote', body: { text: 'hi' } });
    expect(result.ok).toBe(true);
    expect(swagger.requests).toHaveLength(1);
  });

  it('runs a destructive write once exposed; destructive is a signal, not a pause', async () => {
    const { swagger, registry } = makeRegistry();
    const result: any = await registry.execute({ operation: 'deleteProject', path: { id: 'p1' } });
    expect(result.ok).toBe(true);
    expect(swagger.requests).toHaveLength(1);
    expect((registry.get('deleteProject') as any).agentPolicy).toMatchObject({ exposure: 'write', destructive: true, callable: true });
  });

  it('stays held under trust: the document root itself says read', async () => {
    const { swagger, registry } = makeRegistry({ trustSpecAnnotations: true });
    const result: any = await registry.execute({ operation: 'createProject', body: { name: 'Launch' } });
    expect(result.error.code).toBe('READ_ONLY_MODE');
    expect(swagger.requests).toHaveLength(0);
  });

  it('runs a cost-flagged write once exposed; costHint is a signal, not a pause', async () => {
    const { swagger, registry } = makeRegistry();
    const result: any = await registry.execute({ operation: 'createExport' });
    expect(result.ok).toBe(true);
    expect(swagger.requests).toHaveLength(1);
    expect((registry.get('createExport') as any).agentPolicy).toMatchObject({
      exposure: 'write',
      costHint: true,
      costNote: 'Bills the account per export',
      callable: true
    });
  });
});

describe('registration annotations', () => {
  const definitionFor = (key: string, gate: GateContext) => {
    const op = ops.find((candidate) => candidate.key === key)!;
    return operationDefinition({}, op, new AbortController().signal, () => gate);
  };

  it('registers reads with readOnlyHint and without destructiveHint', () => {
    const annotations = definitionFor('GET /projects', gateFor()).annotations;
    expect(annotations).toEqual({ readOnlyHint: true, destructiveHint: false, costHint: false, untrustedContentHint: true });
  });

  it('registers writes without readOnlyHint', () => {
    const annotations = definitionFor('POST /notes', gateFor()).annotations;
    expect(annotations).toEqual({ readOnlyHint: false, destructiveHint: false, costHint: false, untrustedContentHint: true });
  });

  it('marks destructive writes with destructiveHint', () => {
    const annotations = definitionFor('DELETE /projects/{id}', gateFor()).annotations;
    expect(annotations).toEqual({ readOnlyHint: false, destructiveHint: true, costHint: false, untrustedContentHint: true });
  });

  it('keeps correct annotations on auth-gated tools: the client gates the call', () => {
    const annotations = definitionFor('GET /usage', gateFor()).annotations;
    expect(annotations).toEqual({ readOnlyHint: true, destructiveHint: false, costHint: false, untrustedContentHint: true });
  });

  it('marks cost-flagged writes with costHint and costNote', () => {
    const annotations = definitionFor('POST /exports', gateFor()).annotations;
    expect(annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      costHint: true,
      costNote: 'Bills the account per export',
      untrustedContentHint: true
    });
  });

  it('omits costNote when the publisher gave no description', () => {
    const op = ops.find((candidate) => candidate.key === 'DELETE /projects/{id}')!;
    const withBareCostHint = { ...op, documentAnnotation: undefined, annotation: { tool: 'write' as const, destructive: true, costHint: { flagged: true as const } } };
    const annotations = operationDefinition({}, withBareCostHint, new AbortController().signal, () => gateFor()).annotations;
    expect(annotations).toEqual({ readOnlyHint: false, destructiveHint: true, costHint: true, untrustedContentHint: true });
    expect(annotations).not.toHaveProperty('costNote');
  });

  it('refuses a held write at execution time, fail closed on live policy changes', async () => {
    const definition = definitionFor('POST /notes', gateFor({ pageExposure: 'read' }));
    const result: any = await definition.execute({}, {});
    expect(result.error.code).toBe('READ_ONLY_MODE');
  });

  it('refuses with OPERATION_DENIED when a live change hides the operation', async () => {
    const definition = definitionFor('POST /notes', gateFor({ pageExposure: 'hidden' }));
    const result: any = await definition.execute({}, {});
    expect(result.error.code).toBe('OPERATION_DENIED');
  });

  it('refuses with AUTH_REQUIRED when live auth lapses, without re-registering', async () => {
    const { swagger } = makeRegistry();
    swagger.authorize('bearerAuth');
    const op = ops.find((candidate) => candidate.key === 'GET /usage')!;
    const authorized = operationDefinition(
      swagger.system,
      op,
      new AbortController().signal,
      () => gateFor({ authorizedSchemes: ['bearerAuth'] })
    );
    expect(((await authorized.execute({}, {})) as any).ok).toBe(true);
    const revoked = operationDefinition(swagger.system, op, new AbortController().signal, () => gateFor());
    expect(((await revoked.execute({}, {})) as any).error.code).toBe('AUTH_REQUIRED');
    expect(swagger.requests).toHaveLength(1);
  });
});

describe('the page-supplied policy resolver', () => {
  it('composes with x-webmcp and may only tighten', async () => {
    const hideNotes = (op: any) => (op.operationId === 'createNote' ? { tool: 'hidden' } : undefined);
    const { swagger, registry } = makeRegistry({ policyResolver: hideNotes });

    expect((registry.get('createNote') as any).error.code).toBe('OPERATION_NOT_FOUND');
    const result: any = await registry.execute({ operation: 'createNote', body: { text: 'no' } });
    expect(result.error.code).toBe('OPERATION_NOT_FOUND');
    expect(swagger.requests).toHaveLength(0);

    expect((registry.get('deleteProject') as any).agentPolicy.callable).toBe(true);
  });

  it('cannot loosen a write the document held at read', async () => {
    const promote = () => ({ tool: 'write' as const });
    const { swagger, registry } = makeRegistry({ policyResolver: promote });
    const result: any = await registry.execute({ operation: 'createProject', body: { name: 'Launch' } });
    expect(result.error.code).toBe('READ_ONLY_MODE');
    expect(swagger.requests).toHaveLength(0);
  });
});

describe('batched plans', () => {
  it('runs exposed steps in order with no approval stop', async () => {
    const { swagger, registry } = makeRegistry();
    const result: any = await registry.batch({
      steps: [
        { operation: 'createNote', body: { text: 'kickoff' } },
        { operation: 'listProjects' }
      ]
    });

    expect(result.succeeded).toBe(2);
    expect(swagger.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['post /notes', 'get /projects']);
  });

  it('executes nothing at all when one step is hidden', async () => {
    const { swagger, registry } = makeRegistry();
    const result: any = await registry.batch({
      steps: [{ operation: 'listProjects' }, { operation: 'createCharge', body: { amountCents: 1000 } }]
    });
    expect(result.error.code).toBe('OPERATION_NOT_FOUND');
    expect(swagger.requests).toHaveLength(0);
  });

  it('executes nothing when one step is a write held at read', async () => {
    const { swagger, registry } = makeRegistry();
    const result: any = await registry.batch({
      steps: [{ operation: 'createProject', body: { name: 'A' } }, { operation: 'listProjects' }]
    });
    expect(result.error.code).toBe('READ_ONLY_MODE');
    expect(swagger.requests).toHaveLength(0);
  });

  it('executes nothing when one step lacks live authorization', async () => {
    const { swagger, registry } = makeRegistry();
    const result: any = await registry.batch({
      steps: [{ operation: 'listProjects' }, { operation: 'getUsage' }]
    });
    expect(result.error.code).toBe('AUTH_REQUIRED');
    expect(swagger.requests).toHaveLength(0);
  });

  it('runs an authorized batch end to end', async () => {
    const { swagger, registry } = makeRegistry();
    swagger.authorize('bearerAuth');
    const result: any = await registry.batch({
      steps: [{ operation: 'getUsage' }, { operation: 'listProjects' }]
    });
    expect(result.succeeded).toBe(2);
  });

  it('bounds the number of steps', async () => {
    const { registry } = makeRegistry({ maxBatchSteps: 2 });
    const result: any = await registry.batch({
      steps: [{ operation: 'listProjects' }, { operation: 'listProjects' }, { operation: 'listProjects' }]
    });
    expect(result.error.code).toBe('BATCH_TOO_LARGE');
  });
});
