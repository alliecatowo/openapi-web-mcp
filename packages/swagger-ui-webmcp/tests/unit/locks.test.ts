import { describe, expect, it } from 'vitest';
import { installWebMcpShim } from '../../../../tests/webmcp-shim.js';
import { enumerateOperations } from '../../src/openapi/enumerate.js';
import { SessionLocks, applySessionLock } from '../../src/policy/locks.js';
import { WebMcpRegistry } from '../../src/webmcp/registry.js';
import { fakeSwagger } from '../support/fake-swagger.js';

/** Write default page, untrusted document: locks are the only restriction. */
const SPEC = {
  openapi: '3.1.0',
  info: { title: 'Locks fixture', version: '1.0.0' },
  servers: [{ url: 'https://api.test' }],
  paths: {
    '/projects': {
      get: { operationId: 'listProjects' },
      post: { operationId: 'createProject', parameters: [{ name: 'verbose', in: 'query', schema: { type: 'string' } }] }
    },
    '/projects/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      delete: { operationId: 'deleteProject' }
    },
    '/billing/charges': {
      post: { operationId: 'createCharge', 'x-webmcp': { tool: 'hidden' } }
    }
  }
};

function makeRegistry() {
  const locks = new SessionLocks();
  const swagger = fakeSwagger(SPEC);
  swagger.respondWith({ status: 200, body: { ok: true } });
  const registry = new WebMcpRegistry(swagger.system, { sessionLocks: locks });
  return { locks, swagger, registry };
}

function directToolNames(registry: WebMcpRegistry): string[] {
  return (registry.search({}) as any).operations
    .map((op: any) => op.directTool)
    .filter(Boolean);
}

const hasDirectTool = (registry: WebMcpRegistry, prefix: string) =>
  directToolNames(registry).some((name) => name.startsWith(prefix));

describe('the session lock store', () => {
  it('holds locks in memory, versioned, with subscribe/unsubscribe', () => {
    const locks = new SessionLocks();
    expect(locks.count()).toBe(0);
    let notifications = 0;
    const off = locks.subscribe(() => {
      notifications += 1;
    });
    locks.set('GET /projects', 'view');
    expect(locks.get('GET /projects')).toBe('view');
    expect(locks.version).toBe(1);
    expect(notifications).toBe(1);
    locks.set('GET /projects', 'view');
    expect(notifications).toBe(1);
    off();
    locks.set('GET /projects', 'read');
    expect(notifications).toBe(1);
  });

  it('clears all locks at once and prunes operations that left the document', () => {
    const locks = new SessionLocks();
    locks.set('GET /projects', 'view');
    locks.set('POST /gone', 'hidden');
    locks.prune(['GET /projects']);
    expect(locks.get('POST /gone')).toBeUndefined();
    expect(locks.get('GET /projects')).toBe('view');
    locks.clear();
    expect(locks.count()).toBe(0);
  });

  it('treats unknown lock values as no lock', () => {
    const locks = new SessionLocks();
    locks.set('GET /projects', 'sometimes' as any);
    expect(locks.get('GET /projects')).toBeUndefined();
    expect(locks.count()).toBe(0);
  });
});

describe('locks only tighten: they can never widen the spec', () => {
  const ops = () => enumerateOperations(SPEC);
  const read = () => ops().find((op) => op.key === 'GET /projects')!;
  const write = () => ops().find((op) => op.key === 'POST /projects')!;
  const specHidden = () => ops().find((op) => op.key === 'POST /billing/charges')!;

  it('a read lock caps a write at read but leaves reads callable', async () => {
    const { locks, swagger, registry } = makeRegistry();
    locks.set('POST /projects', 'read');
    expect((registry.get('createProject') as any).agentPolicy).toMatchObject({
      exposure: 'read',
      callable: false,
      locked: true,
      lock: 'read'
    });
    expect(((await registry.execute({ operation: 'createProject', query: { verbose: '1' } })) as any).error.code).toBe(
      'LOCKED'
    );
    expect(swagger.requests).toHaveLength(0);

    locks.set('GET /projects', 'read');
    expect(((await registry.execute({ operation: 'listProjects' })) as any).ok).toBe(true);
  });

  it('a view lock keeps the operation listed but denies every call with LOCKED', async () => {
    const { locks, swagger, registry } = makeRegistry();
    locks.set('GET /projects', 'view');
    const detail = registry.get('listProjects') as any;
    expect(detail.agentPolicy).toMatchObject({ callable: false, locked: true, lock: 'view' });
    expect(detail.parameters).toBeDefined();
    expect(((await registry.execute({ operation: 'listProjects' })) as any).error.code).toBe('LOCKED');
    expect(swagger.requests).toHaveLength(0);
  });

  it('a view lock denies writes that the spec allows', async () => {
    const { locks, registry } = makeRegistry();
    locks.set('POST /projects', 'view');
    expect(
      ((await registry.execute({ operation: 'createProject', query: { verbose: '1' } })) as any).error.code
    ).toBe('LOCKED');
  });

  it('a hidden lock removes the operation from search, inspection, and execution', async () => {
    const { locks, swagger, registry } = makeRegistry();
    locks.set('GET /projects', 'hidden');
    expect((registry.search({ query: 'projects' }) as any).operations.map((op: any) => op.key)).not.toContain(
      'GET /projects'
    );
    expect((registry.get('listProjects') as any).error.code).toBe('OPERATION_NOT_FOUND');
    expect(((await registry.execute({ operation: 'listProjects' })) as any).error.code).toBe('OPERATION_NOT_FOUND');
    expect(swagger.requests).toHaveLength(0);
    expect(hasDirectTool(registry, 'api.listProjects.')).toBe(false);
  });

  it('cannot widen: a read lock never unhides a spec-hidden operation', async () => {
    const { locks, registry } = makeRegistry();
    locks.set('POST /billing/charges', 'read');
    expect((registry.get('createCharge') as any).error.code).toBe('OPERATION_NOT_FOUND');
    expect(((await registry.execute({ operation: 'createCharge', body: {} })) as any).error.code).toBe(
      'OPERATION_NOT_FOUND'
    );
  });

  it('cannot widen: a view lock never un-blocks a spec-held write', () => {
    const { registry } = makeRegistry();
    const held = {
      openapi: '3.1.0',
      info: { title: 'T', version: '1' },
      servers: [{ url: 'https://api.test' }],
      'x-webmcp': { tool: 'read' },
      paths: { '/n': { post: { operationId: 'createN' } } }
    };
    const locks = new SessionLocks();
    const swagger = fakeSwagger(held);
    const heldRegistry = new WebMcpRegistry(swagger.system, { sessionLocks: locks });
    locks.set('POST /n', 'view');
    return expect(heldRegistry.execute({ operation: 'createN', body: {} })).resolves.toMatchObject({
      error: { code: 'LOCKED' }
    });
  });

  it('read() and write() fixtures stay consistent with the policy matrix', () => {
    expect(read().readOnly).toBe(true);
    expect(write().readOnly).toBe(false);
    expect(specHidden().annotation?.tool).toBe('hidden');
  });
});

describe('lock changes re-derive the tool set through the normal generation', () => {
  it('hiding then unlocking restores the direct tool without touching the spec', () => {
    const { tools } = installWebMcpShim();
    const { locks, registry } = makeRegistry();
    registry.initialize();
    const registered = (prefix: string) => [...tools.keys()].some((name) => name.startsWith(prefix));
    expect(registered('api.listProjects.')).toBe(true);
    locks.set('GET /projects', 'hidden');
    registry.rebuild();
    expect(registered('api.listProjects.')).toBe(false);
    locks.clear();
    registry.rebuild();
    expect(registered('api.listProjects.')).toBe(true);
  });

  it('a view lock keeps the direct tool registered: SEE stays, CALL fails', async () => {
    const { tools } = installWebMcpShim();
    const { locks, registry } = makeRegistry();
    registry.initialize();
    locks.set('GET /projects', 'view');
    registry.rebuild();
    expect([...tools.keys()].some((name) => name.startsWith('api.listProjects.'))).toBe(true);
    expect(hasDirectTool(registry, 'api.listProjects.')).toBe(true);
  });

  it('a read lock drops the direct tool for the write but keeps it listed', () => {
    const { locks, registry } = makeRegistry();
    locks.set('POST /projects', 'read');
    registry.rebuild();
    expect(hasDirectTool(registry, 'api.createProject.')).toBe(false);
    expect((registry.get('createProject') as any).agentPolicy).toMatchObject({ locked: true, callable: false });
  });

  it('locked batches refuse whole: nothing executes when one step is locked', async () => {
    const { locks, swagger, registry } = makeRegistry();
    locks.set('GET /projects', 'view');
    const result: any = await registry.batch({
      steps: [{ operation: 'createProject', query: { verbose: '1' } }, { operation: 'listProjects' }]
    });
    expect(result.error.code).toBe('LOCKED');
    expect(swagger.requests).toHaveLength(0);
  });

  it('re-registering a generation never drops tools whose names did not change', () => {
    const { tools } = installWebMcpShim();
    const { locks, registry } = makeRegistry();
    registry.initialize();
    const before = [...tools.keys()].find((name) => name.startsWith('api.listProjects.'))!;
    expect(before).toBeTruthy();
    // A view lock re-derives the generation without renaming any tool: the
    // same-name re-registration must survive the old generation's cleanup.
    locks.set('GET /projects', 'view');
    registry.rebuild();
    expect(tools.has(before)).toBe(true);
  });
});

describe('the agent cannot mutate locks', () => {
  it('no input schema anywhere carries a lock field, and no tool sets locks', () => {
    const { tools } = installWebMcpShim();
    const { registry } = makeRegistry();
    registry.initialize();
    for (const [name, definition] of tools) {
      expect(JSON.stringify(definition.inputSchema)).not.toMatch(/"lock/i);
      expect(name.toLowerCase()).not.toContain('lock');
    }
  });

  it('lock-shaped arguments are ignored: they neither set locks nor execute', async () => {
    const { locks, swagger, registry } = makeRegistry();
    const result: any = await registry.execute({ operation: 'listProjects', lock: 'hidden', locks: 'hidden' });
    expect(result.ok).toBe(true);
    expect(swagger.requests).toHaveLength(1);
    expect(locks.count()).toBe(0);
  });

  it('lock state is observable only as effective exposure, never as a control', () => {
    const { locks, registry } = makeRegistry();
    locks.set('GET /projects', 'view');
    const detail = registry.get('listProjects') as any;
    expect(detail.agentPolicy.locked).toBe(true);
    expect(detail.agentPolicy.lock).toBe('view');
    expect(Object.keys(detail.agentPolicy)).not.toContain('setLock');
  });
});

describe('applySessionLock unit matrix', () => {
  const base = { exposure: 'write' as const, hidden: false, blocked: false };

  it('leaves the policy alone without a lock', () => {
    expect(applySessionLock(base, undefined, false)).toMatchObject({ exposure: 'write', locked: false });
  });

  it('view locks any operation without changing its reported level', () => {
    expect(applySessionLock(base, 'view', false)).toMatchObject({ exposure: 'write', locked: true, lock: 'view' });
    expect(applySessionLock({ ...base, blocked: true }, 'view', false).blocked).toBe(true);
  });

  it('read locks cap writes and keep reads executable', () => {
    expect(applySessionLock(base, 'read', false)).toMatchObject({ exposure: 'read', blocked: true, locked: true });
    expect(applySessionLock(base, 'read', true)).toMatchObject({ exposure: 'read', blocked: false, locked: true });
  });
});
