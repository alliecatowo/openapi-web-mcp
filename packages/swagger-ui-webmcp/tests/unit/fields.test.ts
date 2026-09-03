import { describe, expect, it } from 'vitest';
import { enumerateOperations } from '../../src/openapi/enumerate.js';
import { mergeWithLiveValues, readLiveValues, MAX_LIVE_VALUE_CHARS } from '../../src/swagger/fields.js';
import { WebMcpRegistry } from '../../src/webmcp/registry.js';
import { fakeSwagger } from '../support/fake-swagger.js';

const SPEC = {
  openapi: '3.1.0',
  info: { title: 'Fields fixture', version: '1.0.0' },
  servers: [{ url: 'https://api.test' }],
  paths: {
    '/projects': {
      get: {
        operationId: 'listProjects',
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
          { name: 'X-Waypoint-Key', in: 'header', schema: { type: 'string' } }
        ]
      },
      post: {
        operationId: 'createProject',
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } }
      }
    },
    '/projects/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      get: { operationId: 'getProject' }
    }
  }
};

const ops = () => enumerateOperations(SPEC);
const get = (key: string) => ops().find((op) => op.key === key)!;

describe('reading live Try-it-out values', () => {
  it('reports nothing when the person typed nothing', () => {
    const swagger = fakeSwagger(SPEC);
    expect(readLiveValues(swagger.system, get('GET /projects'))).toEqual({});
  });

  it('sees what the person already typed, per group', () => {
    const swagger = fakeSwagger(SPEC);
    swagger.typeParam('/projects', 'get', 'q', 'query', 'checkout');
    swagger.typeParam('/projects', 'get', 'limit', 'query', 5);
    expect(readLiveValues(swagger.system, get('GET /projects'))).toEqual({
      query: { q: 'checkout', limit: 5 }
    });
  });

  it('reads path parameters and request body text', () => {
    const swagger = fakeSwagger(SPEC);
    swagger.typeParam('/projects/{id}', 'get', 'id', 'path', 'prj_alpha');
    expect(readLiveValues(swagger.system, get('GET /projects/{id}'))).toEqual({ path: { id: 'prj_alpha' } });

    swagger.typeBody('/projects', 'post', '{"name":"Typed by hand"}', 'application/json');
    // Reporting shows the raw UI text; it is parsed only when merged for
    // execution (covered below).
    expect(readLiveValues(swagger.system, get('POST /projects'))).toMatchObject({
      body: '{"name":"Typed by hand"}',
      contentType: 'application/json'
    });
  });

  it('never surfaces credential-shaped names, even when typed', () => {
    const swagger = fakeSwagger(SPEC);
    swagger.typeParam('/projects', 'get', 'X-Waypoint-Key', 'header', 'secret');
    // `X-Waypoint-Key` is excluded from the compiled parameters entirely, so
    // there is nothing declared to read back.
    expect(readLiveValues(swagger.system, get('GET /projects'))).toEqual({});
  });

  it('bounds long values when reporting', () => {
    const swagger = fakeSwagger(SPEC);
    swagger.typeParam('/projects', 'get', 'q', 'query', 'x'.repeat(MAX_LIVE_VALUE_CHARS + 100));
    const live = readLiveValues(swagger.system, get('GET /projects'));
    expect((live.query?.q as string).length).toBeLessThanOrEqual(MAX_LIVE_VALUE_CHARS + 1);
  });
});

describe('merging explicit arguments over UI values', () => {
  it('explicit arguments win; missing pieces fall back to the UI', () => {
    const { merged, usedLiveValues } = mergeWithLiveValues(
      get('GET /projects'),
      { query: { q: 'agent' } },
      { query: { q: 'human', limit: 5 } }
    );
    expect(merged).toMatchObject({ query: { q: 'agent', limit: 5 } });
    expect(usedLiveValues).toBe(true);
  });

  it('empty arguments submit entirely from UI values', () => {
    const { merged, usedLiveValues } = mergeWithLiveValues(get('GET /projects'), {}, { query: { q: 'human' } });
    expect(merged).toMatchObject({ query: { q: 'human' } });
    expect(usedLiveValues).toBe(true);
  });

  it('reports when nothing came from the UI', () => {
    const { merged, usedLiveValues } = mergeWithLiveValues(get('GET /projects'), { query: { q: 'agent' } }, {});
    expect(merged).toMatchObject({ query: { q: 'agent' } });
    expect(usedLiveValues).toBe(false);
  });

  it('an explicit body wins over UI-typed text', () => {
    const { merged, usedLiveValues } = mergeWithLiveValues(
      get('POST /projects'),
      { body: { name: 'agent' } },
      { body: '{"name":"human"}', contentType: 'application/json' }
    );
    expect(merged.body).toMatchObject({ name: 'agent' });
    expect(usedLiveValues).toBe(false);
  });
});

describe('shared fields end to end', () => {
  it('executing with empty args submits what the person typed', async () => {
    const swagger = fakeSwagger(SPEC);
    const registry = new WebMcpRegistry(swagger.system, {});
    swagger.typeParam('/projects', 'get', 'q', 'query', 'checkout');

    const result: any = await registry.execute({ operation: 'listProjects' });
    expect(result.ok).toBe(true);
    expect(swagger.requests).toHaveLength(1);
    expect(swagger.requests[0].params).toMatchObject({ 'query.q': 'checkout' });
  });

  it('partial args merge: the UI supplies the path id, the agent the rest', async () => {
    const swagger = fakeSwagger(SPEC);
    const registry = new WebMcpRegistry(swagger.system, {});
    swagger.typeParam('/projects/{id}', 'get', 'id', 'path', 'prj_alpha');

    // Without the merge this would fail INPUT_INVALID for the missing path id.
    const result: any = await registry.execute({ operation: 'getProject' });
    expect(result.ok).toBe(true);
    expect(swagger.requests[0].params).toMatchObject({ 'path.id': 'prj_alpha' });
  });

  it('the agent-filled values land in the Swagger store, visible pre-execution', async () => {
    const swagger = fakeSwagger(SPEC);
    const registry = new WebMcpRegistry(swagger.system, {});
    const result: any = await registry.execute({ operation: 'listProjects', query: { q: 'agent-filled' } });
    expect(result.ok).toBe(true);
    // The same store the Try-it-out form reads from now holds the value.
    expect(readLiveValues(swagger.system, get('GET /projects'))).toMatchObject({ query: { q: 'agent-filled' } });
  });

  it('a UI-typed body is submitted when the agent passes none', async () => {
    const swagger = fakeSwagger(SPEC);
    const registry = new WebMcpRegistry(swagger.system, {});
    swagger.typeBody('/projects', 'post', '{"name":"Typed by hand"}', 'application/json');

    const result: any = await registry.execute({ operation: 'createProject' });
    expect(result.ok).toBe(true);
    expect(swagger.requests[0].body).toMatchObject({ name: 'Typed by hand' });
  });

  it('operation reads report live values so the agent sees work in progress', () => {
    const swagger = fakeSwagger(SPEC);
    const registry = new WebMcpRegistry(swagger.system, {});
    swagger.typeParam('/projects', 'get', 'q', 'query', 'half-typed');
    expect(registry.get('listProjects')).toMatchObject({ liveValues: { query: { q: 'half-typed' } } });
  });

  it('batch steps merge with UI values through the same path', async () => {
    const swagger = fakeSwagger(SPEC);
    const registry = new WebMcpRegistry(swagger.system, {});
    swagger.typeParam('/projects', 'get', 'q', 'query', 'batched');
    const result: any = await registry.batch({ steps: [{ operation: 'listProjects' }] });
    expect(result.succeeded).toBe(1);
    expect(swagger.requests[0].params).toMatchObject({ 'query.q': 'batched' });
  });
});
