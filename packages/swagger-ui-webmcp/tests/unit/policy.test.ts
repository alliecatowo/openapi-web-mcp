import { describe, expect, it } from 'vitest';
import { decide, readAnnotation, resolvePolicy, type PermissionMode } from '../../src/policy/index.js';

const read = { readOnly: true };
const write = { readOnly: false };

describe('permission modes', () => {
  it('reduces each mode to a decision about one operation', () => {
    const cases: Array<[PermissionMode, boolean, string]> = [
      ['no-prompt', true, 'allow'],
      ['no-prompt', false, 'allow'],
      ['ask-for-edits', true, 'allow'],
      ['ask-for-edits', false, 'confirm'],
      ['ask-first', true, 'confirm'],
      ['ask-first', false, 'confirm'],
      ['read-only', true, 'allow'],
      ['read-only', false, 'block'],
      ['deny', true, 'block'],
      ['deny', false, 'block']
    ];
    for (const [mode, readOnly, expected] of cases) {
      expect(`${mode}/${readOnly}: ${decide(mode, readOnly)}`).toBe(`${mode}/${readOnly}: ${expected}`);
    }
  });
});

describe('x-webmcp annotation parsing', () => {
  it('keeps only values this version understands', () => {
    expect(readAnnotation({ policy: 'ask-first', destructive: true, reason: '  needs care  ' })).toEqual({
      policy: 'ask-first',
      destructive: true,
      reason: 'needs care'
    });
  });

  it('drops unknown, malformed and non-object annotations rather than guessing', () => {
    expect(readAnnotation({ policy: 'allow-everything' })).toBeUndefined();
    expect(readAnnotation({ policy: 42 })).toBeUndefined();
    expect(readAnnotation({ destructive: 'yes' })).toBeUndefined();
    expect(readAnnotation('read-only')).toBeUndefined();
    expect(readAnnotation(['no-prompt'])).toBeUndefined();
    expect(readAnnotation(null)).toBeUndefined();
  });

  it('bounds publisher prose', () => {
    const annotation = readAnnotation({ reason: 'x'.repeat(1000) });
    expect(annotation?.reason?.length).toBe(240);
  });
});

describe('untrusted documents may only tighten policy', () => {
  it('lets an annotation raise the requirement above the page default', () => {
    const policy = resolvePolicy({
      pageMode: 'no-prompt',
      operation: { policy: 'ask-first' },
      ...write
    });
    expect(policy.decision).toBe('confirm');
    expect(policy.source).toBe('document');
  });

  it('ignores an annotation that would weaken the page default', () => {
    const policy = resolvePolicy({
      pageMode: 'ask-first',
      operation: { policy: 'no-prompt' },
      ...write
    });
    expect(policy.decision).toBe('confirm');
    expect(policy.source).toBe('page');
  });

  it('cannot re-enable writes under a read-only page', () => {
    for (const attempt of ['no-prompt', 'ask-for-edits', 'ask-first'] as PermissionMode[]) {
      const policy = resolvePolicy({ pageMode: 'read-only', operation: { policy: attempt }, ...write });
      expect(policy.decision).toBe('block');
    }
  });

  it('honours the document default when the operation says nothing', () => {
    const policy = resolvePolicy({
      pageMode: 'no-prompt',
      documentDefault: { policy: 'ask-first' },
      ...read
    });
    expect(policy.decision).toBe('confirm');
  });
});

describe('trusted documents', () => {
  it('let the publisher relax the page default once trust is opted into', () => {
    const policy = resolvePolicy({
      pageMode: 'ask-for-edits',
      operation: { policy: 'no-prompt' },
      trustSpecAnnotations: true,
      ...write
    });
    expect(policy.decision).toBe('allow');
    expect(policy.source).toBe('document');
  });

  it('still fall back to the page default for unannotated operations', () => {
    const policy = resolvePolicy({ pageMode: 'ask-for-edits', trustSpecAnnotations: true, ...write });
    expect(policy.decision).toBe('confirm');
    expect(policy.source).toBe('page');
  });
});

describe('refusals and destructive operations', () => {
  it('treats deny as a withdrawal from the capability set under either trust setting', () => {
    for (const trustSpecAnnotations of [false, true]) {
      const policy = resolvePolicy({
        pageMode: 'no-prompt',
        operation: { policy: 'deny' },
        trustSpecAnnotations,
        ...read
      });
      expect(policy.decision).toBe('block');
      expect(policy.hidden).toBe(true);
    }
  });

  it('treats a page mode of deny as an absolute kill switch', () => {
    for (const trustSpecAnnotations of [false, true]) {
      for (const attempt of ['no-prompt', 'ask-for-edits', 'ask-first'] as PermissionMode[]) {
        const policy = resolvePolicy({
          pageMode: 'deny',
          operation: { policy: attempt },
          trustSpecAnnotations,
          ...read
        });
        expect(policy.decision).toBe('block');
        expect(policy.hidden).toBe(true);
      }
    }
  });

  it('never lets a destructive operation run silently, even on a trusted no-prompt document', () => {
    const policy = resolvePolicy({
      pageMode: 'no-prompt',
      operation: { policy: 'no-prompt', destructive: true },
      trustSpecAnnotations: true,
      ...write
    });
    expect(policy.decision).toBe('confirm');
    expect(policy.destructive).toBe(true);
    expect(policy.source).toBe('destructive');
  });

  it('carries publisher prose for the consent card without altering the decision', () => {
    const policy = resolvePolicy({
      pageMode: 'ask-for-edits',
      operation: { reason: 'Deletes production data.' },
      ...write
    });
    expect(policy.reason).toBe('Deletes production data.');
    expect(policy.decision).toBe('confirm');
  });
});
