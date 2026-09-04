import { describe, expect, it } from 'vitest';
import {
  authSatisfied,
  readAnnotation,
  readAuthGate,
  readCostHint,
  resolvePolicy,
  tighterGate,
  toExposure,
  type ToolExposure
} from '../../src/policy/index.js';

const read = { readOnly: true };
const write = { readOnly: false };

describe('exposure levels', () => {
  it('accepts exactly read, write, and hidden', () => {
    expect(toExposure('read')).toBe('read');
    expect(toExposure('write')).toBe('write');
    expect(toExposure('hidden')).toBe('hidden');
  });

  it('has no legacy aliases: the old permission lattice is gone', () => {
    for (const legacy of ['no-prompt', 'ask-for-edits', 'ask-first', 'read-only', 'deny', 'allow', 'confirm', 'block']) {
      expect(toExposure(legacy)).toBeUndefined();
    }
    expect(toExposure('allow-everything')).toBeUndefined();
    expect(toExposure('')).toBeUndefined();
    expect(toExposure(42)).toBeUndefined();
    expect(toExposure(undefined)).toBeUndefined();
  });
});

describe('x-webmcp annotation parsing', () => {
  it('reads tool levels, auth gates, and destructive flags', () => {
    expect(readAnnotation({ tool: 'write', destructive: true })).toEqual({ tool: 'write', destructive: true });
    expect(readAnnotation({ tool: 'read' })).toEqual({ tool: 'read' });
    expect(readAnnotation({ tool: 'hidden' })).toEqual({ tool: 'hidden' });
    expect(readAnnotation({ destructive: true })).toEqual({ destructive: true });
    expect(readAnnotation({ tool: 'read', requiresAuth: 'bearerAuth' })).toEqual({
      tool: 'read',
      requiresAuth: { any: false, schemes: ['bearerAuth'] }
    });
  });

  it('reads costHint alongside the rest of the vocabulary', () => {
    expect(readAnnotation({ tool: 'write', costHint: true })).toEqual({ tool: 'write', costHint: { flagged: true } });
    expect(readAnnotation({ tool: 'write', costHint: '$0.02 per call' })).toEqual({
      tool: 'write',
      costHint: { flagged: true, note: '$0.02 per call' }
    });
    expect(readAnnotation({ destructive: true, costHint: true })).toEqual({ destructive: true, costHint: { flagged: true } });
  });

  it('ignores every legacy key: policy, agent, reason, and old mode names', () => {
    expect(readAnnotation({ policy: 'deny' })).toBeUndefined();
    expect(readAnnotation({ policy: 'read-only' })).toBeUndefined();
    expect(readAnnotation({ agent: 'write' })).toBeUndefined();
    expect(readAnnotation({ tool: 'write', reason: 'Because.' })).toEqual({ tool: 'write' });
    expect(readAnnotation({ tool: 'allow' })).toBeUndefined();
  });

  it('drops malformed values rather than guessing', () => {
    expect(readAnnotation({ tool: 'sometimes' })).toBeUndefined();
    expect(readAnnotation({ tool: 42 })).toBeUndefined();
    expect(readAnnotation({ destructive: 'yes' })).toBeUndefined();
    expect(readAnnotation({ costHint: false })).toBeUndefined();
    expect(readAnnotation({ costHint: 42 })).toBeUndefined();
    expect(readAnnotation({ costHint: '' })).toBeUndefined();
    expect(readAnnotation({ costHint: { amount: 2 } })).toBeUndefined();
    expect(readAnnotation('read')).toBeUndefined();
    expect(readAnnotation(['write'])).toBeUndefined();
    expect(readAnnotation(null)).toBeUndefined();
  });
});

describe('costHint parsing', () => {
  it('accepts true or a non-empty description string', () => {
    expect(readCostHint(true)).toEqual({ flagged: true });
    expect(readCostHint('Sends a real SMS to the customer')).toEqual({
      flagged: true,
      note: 'Sends a real SMS to the customer'
    });
  });

  it('drops anything else rather than guessing', () => {
    expect(readCostHint(false)).toBeUndefined();
    expect(readCostHint('')).toBeUndefined();
    expect(readCostHint(42)).toBeUndefined();
    expect(readCostHint({ amount: 2 })).toBeUndefined();
    expect(readCostHint(['costly'])).toBeUndefined();
    expect(readCostHint(null)).toBeUndefined();
    expect(readCostHint(undefined)).toBeUndefined();
  });
});

describe('requiresAuth parsing', () => {
  it('accepts true, one scheme, or a list of schemes', () => {
    expect(readAuthGate(true)).toEqual({ any: true, schemes: [] });
    expect(readAuthGate('bearerAuth')).toEqual({ any: false, schemes: ['bearerAuth'] });
    expect(readAuthGate(['bearerAuth', 'waypointKey'])).toEqual({ any: false, schemes: ['bearerAuth', 'waypointKey'] });
  });

  it('drops anything else', () => {
    expect(readAuthGate(false)).toBeUndefined();
    expect(readAuthGate('')).toBeUndefined();
    expect(readAuthGate([])).toBeUndefined();
    expect(readAuthGate([42])).toBeUndefined();
    expect(readAuthGate(42)).toBeUndefined();
    expect(readAuthGate(undefined)).toBeUndefined();
  });

  it('checks several names as ANY of them, mirroring OpenAPI security alternatives', () => {
    const gate = readAuthGate(['bearerAuth', 'waypointKey'])!;
    expect(authSatisfied(gate, [])).toBe(false);
    expect(authSatisfied(gate, ['other'])).toBe(false);
    expect(authSatisfied(gate, ['waypointKey'])).toBe(true);
    expect(authSatisfied(readAuthGate(true)!, [])).toBe(false);
    expect(authSatisfied(readAuthGate(true)!, ['anything'])).toBe(true);
    expect(authSatisfied(undefined, [])).toBe(true);
  });
});

describe('untrusted documents may only tighten exposure', () => {
  it('lets an annotation hold an operation below the page default', () => {
    const policy = resolvePolicy({ pageExposure: 'write', operation: { tool: 'read' }, ...write });
    expect(policy.exposure).toBe('read');
    expect(policy.blocked).toBe(true);
    expect(policy.source).toBe('document');
  });

  it('ignores an annotation that would loosen the page default', () => {
    const policy = resolvePolicy({ pageExposure: 'read', operation: { tool: 'write' }, ...write });
    expect(policy.exposure).toBe('read');
    expect(policy.blocked).toBe(true);
    expect(policy.source).toBe('page');
  });

  it('exposes a write when both the page and the document agree', () => {
    const policy = resolvePolicy({ pageExposure: 'write', operation: { tool: 'write' }, ...write });
    expect(policy.exposure).toBe('write');
    expect(policy.blocked).toBe(false);
    expect(policy.hidden).toBe(false);
  });

  it('honours the document default when the operation says nothing', () => {
    const policy = resolvePolicy({ pageExposure: 'write', documentDefault: { tool: 'read' }, ...write });
    expect(policy.exposure).toBe('read');
    expect(policy.source).toBe('document');
  });

  it('never blocks a read: held at read is exactly what a read needs', () => {
    const policy = resolvePolicy({ pageExposure: 'read', operation: { tool: 'read' }, ...read });
    expect(policy.exposure).toBe('read');
    expect(policy.blocked).toBe(false);
  });
});

describe('requiresAuth resolution', () => {
  it('prefers the operation gate over the document default', () => {
    const policy = resolvePolicy({
      pageExposure: 'write',
      documentDefault: { requiresAuth: { any: true, schemes: [] } },
      operation: { requiresAuth: { any: false, schemes: ['bearerAuth'] } },
      ...read
    });
    expect(policy.requiresAuth).toEqual({ any: false, schemes: ['bearerAuth'] });
  });

  it('falls back to the document default when the operation says nothing', () => {
    const policy = resolvePolicy({
      pageExposure: 'write',
      documentDefault: { requiresAuth: { any: false, schemes: ['waypointKey'] } },
      ...read
    });
    expect(policy.requiresAuth).toEqual({ any: false, schemes: ['waypointKey'] });
  });

  it('leaves ungated operations ungated', () => {
    expect(resolvePolicy({ pageExposure: 'write', ...read }).requiresAuth).toBeUndefined();
  });
});

describe('trusted documents', () => {
  it('let the publisher raise the page default once trust is opted into', () => {
    const policy = resolvePolicy({
      pageExposure: 'read',
      operation: { tool: 'write' },
      trustSpecAnnotations: true,
      ...write
    });
    expect(policy.exposure).toBe('write');
    expect(policy.source).toBe('document');
  });

  it('still fall back to the page default for unannotated operations', () => {
    const policy = resolvePolicy({ pageExposure: 'read', trustSpecAnnotations: true, ...write });
    expect(policy.exposure).toBe('read');
    expect(policy.source).toBe('page');
  });
});

describe('hidden and the kill switch', () => {
  it('treats hidden as a withdrawal from the capability set under either trust setting', () => {
    for (const trustSpecAnnotations of [false, true]) {
      const policy = resolvePolicy({
        pageExposure: 'write',
        operation: { tool: 'hidden' },
        trustSpecAnnotations,
        ...read
      });
      expect(policy.exposure).toBe('hidden');
      expect(policy.hidden).toBe(true);
    }
  });

  it('treats a page exposure of hidden as an absolute kill switch', () => {
    for (const trustSpecAnnotations of [false, true]) {
      for (const attempt of ['read', 'write'] as ToolExposure[]) {
        const policy = resolvePolicy({
          pageExposure: 'hidden',
          operation: { tool: attempt },
          trustSpecAnnotations,
          ...read
        });
        expect(policy.exposure).toBe('hidden');
        expect(policy.hidden).toBe(true);
        expect(policy.source).toBe('page');
      }
    }
  });
});

describe('tighterGate', () => {
  const any = { any: true, schemes: [] as string[] };
  const bearer = { any: false, schemes: ['bearerAuth'] };
  const either = { any: false, schemes: ['bearerAuth', 'waypointKey'] };

  it('orders no gate below any-auth below named schemes', () => {
    expect(tighterGate(undefined, any)).toEqual(any);
    expect(tighterGate(any, bearer)).toEqual(bearer);
    expect(tighterGate(bearer, any)).toEqual(bearer);
  });

  it('treats a scheme subset as tighter', () => {
    expect(tighterGate(either, bearer)).toEqual(bearer);
    expect(tighterGate(bearer, either)).toEqual(bearer);
  });

  it('keeps the document gate when the resolver names something incomparable', () => {
    const key = { any: false, schemes: ['waypointKey'] };
    expect(tighterGate(bearer, key)).toEqual(bearer);
  });
});

describe('page-supplied policy resolvers', () => {
  it('may only tighten what the other sources produced', () => {
    const tightened = resolvePolicy({ pageExposure: 'write', operation: { tool: 'write' }, resolver: { tool: 'read' }, ...write });
    expect(tightened.exposure).toBe('read');
    expect(tightened.blocked).toBe(true);
    expect(tightened.source).toBe('page');

    const ignored = resolvePolicy({ pageExposure: 'write', resolver: { tool: 'write' }, ...read });
    expect(ignored.exposure).toBe('write');
  });

  it('can hide an operation entirely, even one the document exposed', () => {
    const policy = resolvePolicy({
      pageExposure: 'write',
      operation: { tool: 'write' },
      resolver: { tool: 'hidden' },
      trustSpecAnnotations: true,
      ...write
    });
    expect(policy.hidden).toBe(true);
  });

  it('can add the destructive signal', () => {
    const policy = resolvePolicy({ pageExposure: 'write', resolver: { destructive: true }, ...write });
    expect(policy.destructive).toBe(true);
  });

  it('can add an auth gate, but never loosen the document one', () => {
    const added = resolvePolicy({
      pageExposure: 'write',
      operation: { tool: 'read' },
      resolver: { requiresAuth: { any: true, schemes: [] } },
      ...read
    });
    expect(added.requiresAuth).toEqual({ any: true, schemes: [] });

    const kept = resolvePolicy({
      pageExposure: 'write',
      operation: { tool: 'read', requiresAuth: { any: false, schemes: ['bearerAuth'] } },
      resolver: { requiresAuth: { any: true, schemes: [] } },
      ...read
    });
    expect(kept.requiresAuth).toEqual({ any: false, schemes: ['bearerAuth'] });
  });
});

describe('destructive operations', () => {
  it('ORs the destructive flag across document root, operation, and resolver', () => {
    expect(resolvePolicy({ pageExposure: 'write', documentDefault: { destructive: true }, ...write }).destructive).toBe(true);
    expect(resolvePolicy({ pageExposure: 'write', operation: { destructive: true }, ...write }).destructive).toBe(true);
    expect(resolvePolicy({ pageExposure: 'write', ...write }).destructive).toBe(false);
  });
});

describe('cost hints', () => {
  it('ORs the flag across document root, operation, and resolver, exactly like destructive', () => {
    expect(
      resolvePolicy({ pageExposure: 'write', documentDefault: { costHint: { flagged: true } }, ...write }).costHint
    ).toEqual({ flagged: true });
    expect(resolvePolicy({ pageExposure: 'write', operation: { costHint: { flagged: true } }, ...write }).costHint).toEqual({
      flagged: true
    });
    expect(
      resolvePolicy({ pageExposure: 'write', resolver: { costHint: { flagged: true } }, ...write }).costHint
    ).toEqual({ flagged: true });
    expect(resolvePolicy({ pageExposure: 'write', ...write }).costHint).toBeUndefined();
  });

  it('prefers the operation note over the document root note, and the root note over the resolver note', () => {
    const opNote = resolvePolicy({
      pageExposure: 'write',
      documentDefault: { costHint: { flagged: true, note: 'root note' } },
      operation: { costHint: { flagged: true, note: 'operation note' } },
      resolver: { costHint: { flagged: true, note: 'resolver note' } },
      ...write
    }).costHint;
    expect(opNote).toEqual({ flagged: true, note: 'operation note' });

    const rootNote = resolvePolicy({
      pageExposure: 'write',
      documentDefault: { costHint: { flagged: true, note: 'root note' } },
      resolver: { costHint: { flagged: true, note: 'resolver note' } },
      ...write
    }).costHint;
    expect(rootNote).toEqual({ flagged: true, note: 'root note' });
  });

  it('lets a resolver-supplied note surface even when a bare `true` flagged it elsewhere', () => {
    const policy = resolvePolicy({
      pageExposure: 'write',
      operation: { costHint: { flagged: true } },
      resolver: { costHint: { flagged: true, note: 'resolver detail' } },
      ...write
    });
    expect(policy.costHint).toEqual({ flagged: true, note: 'resolver detail' });
  });

  it('is not a capability restriction: a flagged operation still runs when otherwise exposed', () => {
    const policy = resolvePolicy({ pageExposure: 'write', operation: { tool: 'write', costHint: { flagged: true } }, ...write });
    expect(policy.blocked).toBe(false);
    expect(policy.hidden).toBe(false);
    expect(policy.exposure).toBe('write');
  });
});
