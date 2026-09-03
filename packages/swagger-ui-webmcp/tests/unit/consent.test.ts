import { beforeEach, describe, expect, it } from 'vitest';
import { WebMcpRegistry } from '../../src/webmcp/registry.js';
import { fakeConsole, type FakeConsole } from '../support/fake-console.js';
import { fakeSwagger } from '../support/fake-swagger.js';

/** A document exercising every branch of the policy resolver. */
const SPEC = {
  openapi: '3.1.0',
  info: { title: 'Policy fixture', version: '1.0.0' },
  servers: [{ url: 'https://api.test' }],
  'x-webmcp': { policy: 'ask-for-edits' },
  paths: {
    '/projects': {
      get: { operationId: 'listProjects' },
      post: { operationId: 'createProject' }
    },
    '/notes': {
      post: {
        operationId: 'createNote',
        'x-webmcp': { policy: 'no-prompt', reason: 'Notes are additive.' }
      }
    },
    '/projects/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      delete: {
        operationId: 'deleteProject',
        'x-webmcp': { destructive: true, reason: 'Removes the project permanently.' }
      }
    },
    '/billing/charges': {
      post: { operationId: 'createCharge', 'x-webmcp': { policy: 'deny', reason: 'Payments are out of scope.' } }
    }
  }
};

function makeRegistry(console: FakeConsole, config: Record<string, unknown> = {}) {
  const swagger = fakeSwagger(SPEC);
  swagger.respondWith({ status: 201, body: { ok: true } });
  const registry = new WebMcpRegistry(swagger.system, { console, trustSpecAnnotations: true, ...config });
  return { swagger, registry, system: swagger.system };
}

let agentConsole: FakeConsole;
beforeEach(() => {
  agentConsole = fakeConsole();
});

describe('human approval', () => {
  it('runs a read without asking anyone', async () => {
    const { swagger, registry } = makeRegistry(agentConsole);
    const result: any = await registry.execute({ operation: 'listProjects' });
    expect(result.ok).toBe(true);
    expect(agentConsole.prompts).toHaveLength(0);
    expect(swagger.requests).toHaveLength(1);
  });

  it('pauses a write on a consent card and executes once approved', async () => {
    const { swagger, registry } = makeRegistry(agentConsole);
    const result: any = await registry.execute({ operation: 'createProject', body: { name: 'Launch' } });
    expect(agentConsole.prompts).toHaveLength(1);
    expect(agentConsole.prompts[0].title).toBe('POST /projects');
    expect(result.ok).toBe(true);
    expect(swagger.requests).toHaveLength(1);
  });

  it('does not touch the API when a person declines', async () => {
    agentConsole.answer = () => 'deny';
    const { swagger, registry } = makeRegistry(agentConsole);
    const result: any = await registry.execute({ operation: 'createProject', body: { name: 'Launch' } });
    expect(result.error.code).toBe('PERMISSION_REQUIRED');
    expect(swagger.requests).toHaveLength(0);
  });

  it('stops asking after "always allow", but only for that operation', async () => {
    agentConsole.answer = () => 'always';
    const { registry } = makeRegistry(agentConsole);
    await registry.execute({ operation: 'createProject', body: { name: 'One' } });
    await registry.execute({ operation: 'createProject', body: { name: 'Two' } });
    expect(agentConsole.prompts).toHaveLength(1);

    await registry.execute({ operation: 'DELETE /projects/{id}', path: { id: 'p1' } });
    expect(agentConsole.prompts).toHaveLength(2);
  });

  it('shows the publisher reason and withholds "always allow" for destructive calls', async () => {
    const { registry } = makeRegistry(agentConsole);
    await registry.execute({ operation: 'deleteProject', path: { id: 'p1' } });
    const prompt = agentConsole.prompts[0];
    expect(prompt.destructive).toBe(true);
    expect(prompt.allowRemember).toBe(false);
    expect(prompt.reason).toBe('Removes the project permanently.');
    expect(prompt.lines).toContain('Path: id="p1"');
  });

  it('lets a trusted document waive the prompt for a cheap write', async () => {
    const { swagger, registry } = makeRegistry(agentConsole);
    const result: any = await registry.execute({ operation: 'createNote', body: { text: 'hi' } });
    expect(agentConsole.prompts).toHaveLength(0);
    expect(result.ok).toBe(true);
    expect(swagger.requests).toHaveLength(1);
  });

  it('re-asks for that same write when the document is not trusted', async () => {
    const { registry } = makeRegistry(agentConsole, { trustSpecAnnotations: false });
    await registry.execute({ operation: 'createNote', body: { text: 'hi' } });
    expect(agentConsole.prompts).toHaveLength(1);
  });
});

describe('operations the publisher withheld', () => {
  it('keeps a denied operation out of search and inspection entirely', () => {
    const { registry } = makeRegistry(agentConsole);
    const names = registry.search({}).operations.map((op: any) => op.key);
    expect(names).not.toContain('POST /billing/charges');
    expect((registry.get('createCharge') as any).error.code).toBe('OPERATION_NOT_FOUND');
  });

  it('refuses to execute a denied operation without prompting anyone', async () => {
    const { swagger, registry } = makeRegistry(agentConsole);
    const result: any = await registry.execute({ operation: 'createCharge', body: { amountCents: 100 } });
    expect(result.error.code).toBe('OPERATION_NOT_FOUND');
    expect(agentConsole.prompts).toHaveLength(0);
    expect(swagger.requests).toHaveLength(0);
  });

  it('reports why a write is unavailable under a read-only page', async () => {
    const { swagger, registry } = makeRegistry(agentConsole, { permissionMode: 'read-only', trustSpecAnnotations: false });
    const result: any = await registry.execute({ operation: 'createProject', body: { name: 'Launch' } });
    expect(result.error.code).toBe('READ_ONLY_MODE');
    expect(swagger.requests).toHaveLength(0);
  });

  it('surfaces the resolved policy so an agent can explain itself', () => {
    const { registry } = makeRegistry(agentConsole);
    const found: any = registry.get('deleteProject');
    expect(found.agentPolicy).toMatchObject({ decision: 'confirm', destructive: true, requiresApproval: true });
    // Publisher prose must not leak into anything the model reads as instruction.
    expect(JSON.stringify(found.agentPolicy)).not.toContain('permanently');
  });
});

describe('batched plans', () => {
  it('asks once for a multi-step plan and runs the steps in order', async () => {
    const { swagger, registry } = makeRegistry(agentConsole);
    const result: any = await registry.batch({
      steps: [
        { operation: 'createProject', body: { name: 'Launch' } },
        { operation: 'createNote', body: { text: 'kickoff' } },
        { operation: 'listProjects' }
      ]
    });

    expect(agentConsole.prompts).toHaveLength(1);
    expect(agentConsole.prompts[0].lines).toEqual(['1. POST /projects', '2. POST /notes', '3. GET /projects']);
    expect(result.succeeded).toBe(3);
    expect(swagger.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['post /projects', 'post /notes', 'get /projects']);
  });

  it('executes nothing at all when one step is forbidden', async () => {
    const { swagger, registry } = makeRegistry(agentConsole);
    const result: any = await registry.batch({
      steps: [
        { operation: 'listProjects' },
        { operation: 'createCharge', body: { amountCents: 1000 } }
      ]
    });
    expect(result.error.code).toBe('OPERATION_NOT_FOUND');
    expect(swagger.requests).toHaveLength(0);
    expect(agentConsole.prompts).toHaveLength(0);
  });

  it('executes nothing when a person declines the plan', async () => {
    agentConsole.answer = () => 'deny';
    const { swagger, registry } = makeRegistry(agentConsole);
    const result: any = await registry.batch({
      steps: [{ operation: 'createProject', body: { name: 'A' } }, { operation: 'listProjects' }]
    });
    expect(result.error.code).toBe('PERMISSION_REQUIRED');
    expect(swagger.requests).toHaveLength(0);
  });

  it('flags the whole plan destructive when any step is', async () => {
    const { registry } = makeRegistry(agentConsole);
    await registry.batch({
      steps: [{ operation: 'listProjects' }, { operation: 'deleteProject', path: { id: 'p1' } }]
    });
    expect(agentConsole.prompts[0].destructive).toBe(true);
    expect(agentConsole.prompts[0].allowRemember).toBe(false);
  });

  it('bounds the number of steps', async () => {
    const { registry } = makeRegistry(agentConsole, { maxBatchSteps: 2 });
    const result: any = await registry.batch({
      steps: [{ operation: 'listProjects' }, { operation: 'listProjects' }, { operation: 'listProjects' }]
    });
    expect(result.error.code).toBe('BATCH_TOO_LARGE');
  });
});
